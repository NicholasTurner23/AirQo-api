from setuptools import setup, find_packages

VERSION = "1.0.0"
DESCRIPTION = "AirQo Airflow custom python package"
LONG_DESCRIPTION = "This package contains functions shared by the DAG files"

setup(
    name="airqo_etl_utils",
    version=VERSION,
    author="AirQo",
    author_email="<data@airqo.net>",
    description=DESCRIPTION,
    long_description=LONG_DESCRIPTION,
    packages=find_packages(),
    package_data={"": ["*.json"]},
    install_requires=[
        "pandas",
        "requests",
        "simplejson",
        "kafka-python",
        "numpy",
        "pyarrow",
        "python-dotenv",
        "google-cloud-bigquery",
        "google-cloud-bigquery[pandas]",
        "google-cloud-storage",
        "firebase-admin",
        "apache-airflow-providers-http",
        "apache-airflow-providers-slack",
        "apache-airflow-providers-google",
        "apache-airflow[sentry]",
        "lightgbm~=4.1.0",
        "mlflow",
        "gcsfs~=2023.9.2",
        "pymongo~=4.5.0",
        "optuna",
        "tweepy",
    ],
    keywords=["python", "airflow", "AirQo"],
    license="MIT",
    classifiers=[
        "Intended Audience :: AirQo Airflow Users",
        "Programming Language :: Python :: 3",
    ],
)
