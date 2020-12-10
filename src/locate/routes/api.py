base_url = '/api/v1'
route = {
    'root': '/',
    'health_check': '/health',
    'parishes': base_url + '/map/parishes',
    'save_map': base_url + '/map/savelocatemap',
    'get_map': base_url + '/map/getlocatemap/<user_id>',
    'update_map': base_url + '/map/updatelocatemap/<user_id>/<space_name>',
    'delete_map': base_url + '/map/deletelocatemap/<user_id>/<space_name>',
}