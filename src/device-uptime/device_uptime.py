from concurrent.futures import ThreadPoolExecutor

import logging
import pandas as pd
import requests
import statistics
from datetime import datetime
from datetime import timedelta
from dateutil.tz import UTC
from google.cloud import bigquery

from config import Config
from helpers.convert_dates import date_to_str
from models import Device, NetworkUptime, DeviceUptime
from utils.device_hourly_records import DeviceChannelRecords

_logger = logging.getLogger(__name__)


def get_device_records(tenant, channel_id, device_name, is_active):
    device_channel_records = DeviceChannelRecords(tenant, device_name, channel_id)
    device_records = device_channel_records.get_sensor_readings()
    uptime, downtime = device_channel_records.calculate_uptime()
    sensor_one_pm2_5 = device_records.sensor_one_pm2_5
    sensor_two_pm2_5 = device_records.sensor_two_pm2_5
    battery_voltage = device_records.battery_voltage
    created_at = device_records.time
    created_at = created_at.replace(tzinfo=UTC)

    record = {
        "sensor_one_pm2_5": sensor_one_pm2_5 if sensor_one_pm2_5 else 0,
        "sensor_two_pm2_5": sensor_two_pm2_5 if sensor_two_pm2_5 else 0,
        "battery_voltage": battery_voltage if battery_voltage else 0,
        "device_name": device_name,
        "channel_id": channel_id,
        "uptime": uptime,
        "downtime": downtime,
        "created_at": created_at,
        "is_active": is_active,
    }

    return record


def save_device_uptime(tenant):
    device_model = Device(tenant)
    devices = device_model.get_all_devices()
    records = []
    futures = []
    executor = ThreadPoolExecutor()
    active_device_count = 0

    for device in devices:
        if device.get("network", "") != "airqo":
            continue
        if device.get("isActive"):
            active_device_count += 1

        channel_id = device["device_number"]
        device_name = device["name"]

        if not (channel_id and device_name):
            print("this device could not be processed", device_name)
            continue
        futures.append(
            executor.submit(
                get_device_records,
                tenant,
                channel_id,
                device_name,
                device.get("isActive"),
            )
        )
    for future in futures:
        try:
            records.append(future.result())
        except Exception as e:
            import sys
            from traceback import print_tb, print_exc
            from colored import fg, attr

            color_warning = fg("#FF6600")
            reset = attr("reset")
            print("error occurred while fetching data -", e)
            print(color_warning)
            print_exc(file=sys.stdout)
            print(reset)

    network_uptime = 0.0
    if records:
        network_uptime = (
            sum(
                record.get("uptime", 0.0)
                for record in records
                if record.get("is_active")
            )
            / active_device_count
        )

    device_uptime_model = DeviceUptime(tenant)
    device_uptime_model.save_device_uptime(records)

    created_at = datetime.utcnow()
    created_at = created_at.replace(tzinfo=UTC)

    network_uptime_record = {
        "network_name": tenant,
        "uptime": network_uptime,
        "created_at": created_at,
    }

    print("network uptime", network_uptime_record)
    network_uptime_model = NetworkUptime(tenant)
    network_uptime_model.save_network_uptime([network_uptime_record])


class Uptime:
    def __init__(
        self,
        start_date_time: datetime,
        end_date_time: datetime,
        data_points_per_30_minutes: int,
        devices: list,
    ):
        self.__client = bigquery.Client()
        self.__raw_data_table = f"`{Config.BIGQUERY_RAW_DATA}`"
        self.__devices = devices

        self.__data_points_threshold = data_points_per_30_minutes
        self.__start_date_time = self.__format_timestamp(start_date_time)
        self.__end_date_time = self.__format_timestamp(end_date_time)

        self.__data = pd.DataFrame()

        self.__devices_uptime = pd.DataFrame()
        self.__overall_uptime = 0
        self.__overall_downtime = 0
        self.__results = {}
        self.__date_format = "%Y-%m-%dT%H:%M:%SZ"

    def results(self):
        return self.__results

    def compute(self):

        if self.__data.empty:
            self.__load_devices_data()

        self.__aggregate_data()

        self.__results = {
            "overall_uptime": self.__overall_uptime,
            "overall_downtime": self.__overall_downtime,
            "start_date_time": date_to_str(self.__start_date_time),
            "end_date_time": date_to_str(self.__end_date_time),
            "devices_uptime": self.__devices_uptime.to_dict("records"),
        }

        return self.__results

    def save(self):
        pass

    def __format_timestamp(self, timestamp: datetime):

        if 0 <= timestamp.minute <= 30:
            timestamp_format = "%Y-%m-%dT%H:00:00Z"
            timestamp_str = date_to_str(timestamp, str_format=timestamp_format)
        elif timestamp.minute > 30:
            timestamp_format = "%Y-%m-%dT%H:30:00Z"
            timestamp_str = date_to_str(timestamp, str_format=timestamp_format)
        else:
            timestamp_format = self.__date_format
            timestamp_str = date_to_str(timestamp, str_format=timestamp_format)

        return datetime.strptime(timestamp_str, timestamp_format)

    @staticmethod
    def dates_array(start_date_time, end_date_time):
        dates = pd.date_range(start_date_time, end_date_time, freq="30min")
        freq = dates.freq

        if dates.values.size == 1:
            dates = dates.append(pd.Index([pd.to_datetime(end_date_time)]))

        dates = [pd.to_datetime(str(date)) for date in dates.values]
        return_dates = []

        array_last_date_time = dates.pop()
        for date in dates:
            end = date + timedelta(hours=freq.n)
            if end > array_last_date_time:
                end = array_last_date_time
            return_dates.append(
                (
                    date,
                    end,
                )
            )

        return return_dates

    def __create_data(self) -> pd.DataFrame:
        dates = self.dates_array(self.__start_date_time, self.__end_date_time)
        data = []
        for start, end in dates:
            for device in self.__devices:

                data.extend(
                    [
                        {"timestamp": start, "device": device},
                        {"timestamp": end, "device": device},
                    ]
                )

        data = pd.DataFrame(data)
        data.drop_duplicates(inplace=True)
        data["timestamp"] = pd.to_datetime(data["timestamp"])
        return data

    def __aggregate_data(self) -> pd.DataFrame:

        uptime_data = self.__create_data()
        data = self.__data.copy()
        data["timestamp"] = data["timestamp"].apply(self.__format_timestamp)
        devices_data = []
        for _, device_group in data.groupby("device"):
            device_id = device_group.iloc[0]["device"]
            device_data = []

            for _, timestamp_group in device_group.groupby("timestamp"):
                timestamp = timestamp_group.iloc[0]["timestamp"]
                device_data.append(
                    {
                        "device": device_id,
                        "timestamp": timestamp,
                        "data_points": len(timestamp_group.index),
                        "average_battery": statistics.mean(
                            timestamp_group["battery"].to_list()
                        ),
                    }
                )
            devices_data.extend(device_data)

        devices_data = pd.DataFrame(devices_data)

        devices_data.timestamp.astype("datetime64[ns]")
        uptime_data.timestamp.astype("datetime64[ns]")

        uptime_data = pd.merge(
            left=uptime_data,
            right=devices_data,
            on=["device", "timestamp"],
            how="left",
        )

        uptime_data.drop_duplicates(subset=["device", "timestamp"], inplace=True)
        uptime_data.fillna(0, inplace=True)

        uptime_data["timestamp"] = uptime_data["timestamp"].apply(date_to_str)
        uptime_data[["uptime", "downtime"]] = uptime_data["data_points"].apply(
            lambda x: self.__calculate_uptime(x)
        )

        self.__overall_uptime = statistics.mean(uptime_data["uptime"].to_list())
        self.__overall_downtime = statistics.mean(uptime_data["downtime"].to_list())
        self.__devices_uptime = uptime_data

        return uptime_data

    def __calculate_uptime(self, data_points):
        series = pd.Series(dtype=float)

        series["uptime"] = 100
        series["downtime"] = 0

        if data_points < self.__data_points_threshold:
            series["uptime"] = (data_points / self.__data_points_threshold) * 100
            series["downtime"] = 100 - series["uptime"]

        return series

    def __load_devices_data(self):

        query = (
            f" SELECT timestamp, device_id as device, battery "
            f" FROM {self.__raw_data_table} "
            f" WHERE {self.__raw_data_table}.timestamp >= '{date_to_str(self.__start_date_time, str_format=self.__date_format)}' "
            f" AND {self.__raw_data_table}.timestamp <= '{date_to_str(self.__end_date_time, str_format=self.__date_format)}' "
            f" AND ( {self.__raw_data_table}.s1_pm2_5 is not null  "
            f" OR {self.__raw_data_table}.s2_pm2_5 is not null ) "
            f" AND device_id IN UNNEST({self.__devices})"
        )

        dataframe = self.__client.query(query=query).result().to_dataframe()

        if dataframe.empty:
            dataframe = pd.DataFrame([], columns=["timestamp", "device", "battery"])

        dataframe["timestamp"] = dataframe["timestamp"].apply(pd.to_datetime)
        dataframe.drop_duplicates(
            subset=["timestamp", "device"], keep="first", inplace=True
        )

        self.__data = dataframe
        return dataframe


def compute_and_save_device_uptime(
    expected_data_points: int = None,
    end_date_time: datetime = None,
    start_date_time: datetime = None,
    devices: list = None,
):

    if expected_data_points is None:
        expected_data_points = Config.UPTIME_EXPECTED_DATA_POINTS

    if end_date_time is None:
        end_date_time = datetime.utcnow()

    if start_date_time is None:
        start_date_time = end_date_time - timedelta(hours=2)

    if devices is None:
        devices = []
        response = requests.get(
            "https://platform.airqo.net/api/v1/devices?tenant=airqo&network=airqo"
        ).json()
        for device in response["devices"]:
            if device.get("isActive", False):
                devices.append(device["name"])

    uptime = Uptime(
        devices=devices,
        start_date_time=start_date_time,
        end_date_time=end_date_time,
        data_points_per_30_minutes=expected_data_points,
    )
    uptime.compute()
    print(uptime.results())
    uptime.save()


if __name__ == "__main__":
    compute_and_save_device_uptime()
