import os
from flask import Flask, render_template, request, jsonify
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
from dotenv import load_dotenv

# 載入環境變數 (從 .env 檔案)
load_dotenv()

app = Flask(__name__)

# 初始化 Slack Client
slack_token = os.environ.get("SLACK_BOT_TOKEN")
if not slack_token:
    raise ValueError("SLACK_BOT_TOKEN not found in environment variables. Please set it in .env file.")
client = WebClient(token=slack_token)

# --- 輔助函式 ---
def get_all_users():
    """獲取所有非機器人的活躍使用者"""
    try:
        users = []
        cursor = None
        while True:
            response = client.users_list(cursor=cursor, limit=200)
            for user in response['members']:
                if not user['is_bot'] and not user['deleted']:
                    users.append({'id': user['id'], 'name': user['real_name'] or user['name']})
            cursor = response.get('response_metadata', {}).get('next_cursor')
            if not cursor:
                break
        return sorted(users, key=lambda x: x['name'])
    except SlackApiError as e:
        print(f"Error fetching users: {e}")
        return []

def get_all_channels():
    """獲取所有公開和私人的頻道 (未封存)"""
    try:
        channels = []
        cursor = None
        while True:
            response = client.conversations_list(
                types="public_channel,private_channel",
                exclude_archived=True,
                limit=1000,
                cursor=cursor
            )
            for channel in response['channels']:
                channels.append({
                    'id': channel['id'],
                    'name': channel['name'],
                    'is_private': channel['is_private']
                })
            cursor = response.get('response_metadata', {}).get('next_cursor')
            if not cursor:
                break
        return sorted(channels, key=lambda x: x['name'])
    except SlackApiError as e:
        print(f"Error fetching channels: {e}")
        return []

def get_channel_members(channel_id):
    """獲取特定頻道的成員 ID 列表"""
    try:
        member_ids = []
        cursor = None
        while True:
            response = client.conversations_members(channel=channel_id, cursor=cursor, limit=1000)
            member_ids.extend(response['members'])
            cursor = response.get('response_metadata', {}).get('next_cursor')
            if not cursor:
                break
        return member_ids
    except SlackApiError as e:
        if e.response['error'] == 'not_in_channel':
            return []
        print(f"Error fetching members for channel {channel_id}: {e}")
        return []

# --- Flask 路由 (API Endpoints) ---

@app.route('/')
def index():
    """渲染主頁面"""
    return render_template('index.html')

@app.route('/api/data', methods=['GET'])
def get_initial_data():
    """提供前端所需的所有初始資料"""
    users = get_all_users()
    channels = get_all_channels()
    
    for channel in channels:
        channel['members'] = get_channel_members(channel['id'])
        
    return jsonify({
        'users': users,
        'channels': channels
    })

@app.route('/api/create_channel', methods=['POST'])
def create_channel():
    """建立新頻道"""
    data = request.json
    channel_name = data.get('name')
    is_private = data.get('is_private', False)

    if not channel_name:
        return jsonify({'ok': False, 'error': 'Channel name is required'}), 400

    try:
        response = client.conversations_create(name=channel_name.lower(), is_private=is_private)
        if response['ok']:
            # 建立成功後，自動將機器人加入頻道 (私人頻道建立時會自動加入)
            if not is_private:
                client.conversations_join(channel=response['channel']['id'])
            return jsonify({'ok': True, 'channel': response['channel']})
        else:
            return jsonify({'ok': False, 'error': response['error']})
    except SlackApiError as e:
        return jsonify({'ok': False, 'error': e.response['error']}), 500

@app.route('/api/update_memberships', methods=['POST'])
def update_memberships():
    """同步使用者和頻道的關係"""
    data = request.json
    channel_id = data.get('channel_id')
    target_member_ids = set(data.get('target_member_ids', []))

    if not channel_id:
        return jsonify({'ok': False, 'error': 'Channel ID is required'}), 400

    try:
        current_member_ids = set(get_channel_members(channel_id))
        
        users_to_invite = list(target_member_ids - current_member_ids)
        users_to_kick = list(current_member_ids - target_member_ids)

        if users_to_invite:
            invite_response = client.conversations_invite(channel=channel_id, users=users_to_invite)
            if not invite_response['ok']:
                raise SlackApiError(message=invite_response['error'], response=invite_response)

        if users_to_kick:
            for user_id in users_to_kick:
                if user_id != client.auth_test()['user_id']:
                    try:
                        client.conversations_kick(channel=channel_id, user=user_id)
                    except SlackApiError as kick_error:
                        if kick_error.response['error'] not in ['not_in_channel', 'user_not_in_channel']:
                            print(f"Failed to kick {user_id} from {channel_id}: {kick_error}")

        return jsonify({'ok': True, 'message': 'Membership updated successfully.'})

    except SlackApiError as e:
        if e.response['error'] == 'not_in_channel':
            error_message = "操作失敗：機器人不是該私人頻道的成員。請先將機器人手動加入頻道！"
            return jsonify({'ok': False, 'error': error_message}), 403
        
        return jsonify({'ok': False, 'error': e.response['error']}), 500

@app.route('/api/archive_channel', methods=['POST'])
def archive_channel():
    """封存一個頻道"""
    data = request.json
    channel_id = data.get('channel_id')

    if not channel_id:
        return jsonify({'ok': False, 'error': 'Channel ID is required'}), 400

    try:
        response = client.conversations_archive(channel=channel_id)
        if response['ok']:
            return jsonify({'ok': True, 'message': 'Channel archived successfully.'})
        else:
            return jsonify({'ok': False, 'error': response['error']})
    except SlackApiError as e:
        if e.response['error'] == 'not_in_channel':
            error_message = "操作失敗：機器人不是該私人頻道的成員。"
            return jsonify({'ok': False, 'error': error_message}), 403
        
        return jsonify({'ok': False, 'error': e.response['error']}), 500

if __name__ == '__main__':
    app.run(debug=True)