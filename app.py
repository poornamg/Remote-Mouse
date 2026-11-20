from flask import Flask, render_template
from flask_socketio import SocketIO
import pyautogui
import socket
import qrcode
import logging

# Disable Flask logging for a cleaner terminal
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Disable failsafe to prevent crashes if mouse hits the screen corner
pyautogui.FAILSAFE = False

import json
import os

CONFIG_FILE = 'config.json'

def load_gestures():
    try:
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {
            "3_finger_tap": ["playpause"],
            "3_finger_up": ["volumeup"],
            "3_finger_down": ["volumedown"],
            "3_finger_left": ["alt", "shift", "tab"],
            "3_finger_right": ["alt", "tab"],
            "4_finger_tap": ["win", "a"],
            "4_finger_up": ["win", "tab"],
            "4_finger_down": ["win", "d"],
            "4_finger_left": ["win", "ctrl", "right"],
            "4_finger_right": ["win", "ctrl", "left"]
        }

# Load settings when server starts
GESTURES = load_gestures()

is_alt_tab_active = False

def release_alt():
    global is_alt_tab_active
    if is_alt_tab_active:
        try:
            pyautogui.keyUp('alt')
        except Exception:
            pass
        is_alt_tab_active = False

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('disconnect')
def handle_disconnect():
    release_alt()

@socketio.on('move')
def handle_move(data):
    release_alt()
    try:
        pyautogui.moveRel(data['dx'], data['dy'])
    except Exception:
        pass

@socketio.on('scroll')
def handle_scroll(data):
    release_alt()
    try:
        pyautogui.scroll(int(data['dy']))
    except Exception:
        pass

@socketio.on('click')
def handle_click(data):
    release_alt()
    try:
        if data.get('double'):
            pyautogui.doubleClick(button=data.get('button', 'left'))
        else:
            pyautogui.click(button=data.get('button', 'left'))
    except Exception:
        pass

@socketio.on('key_press')
def handle_key(data):
    release_alt()
    try:
        key = data.get('key').lower()
        if key == 'backspace':
            pyautogui.press('backspace')
        elif key == 'enter':
            pyautogui.press('enter')
        elif len(key) == 1:
            pyautogui.write(key)
        else:
            pyautogui.press(key) 
    except Exception:
        pass

@socketio.on('hotkey')
def handle_hotkey(data):
    release_alt()
    try:
        keys = data.get('keys', [])
        pyautogui.hotkey(*keys)
    except Exception:
        pass

@socketio.on('gesture')
def handle_gesture(data):
    release_alt()
    try:
        action = data.get('action')
        if action in GESTURES:
            pyautogui.hotkey(*GESTURES[action])
    except Exception:
        pass

@socketio.on('alt_tab_start')
def handle_alt_tab_start(data):
    global is_alt_tab_active
    try:
        direction = data.get('dir', 'right')
        pyautogui.keyDown('alt')
        if direction == 'left':
            pyautogui.hotkey('shift', 'tab')
        else:
            pyautogui.press('tab')
        is_alt_tab_active = True
    except Exception:
        pass

@socketio.on('alt_tab_step')
def handle_alt_tab_step(data):
    global is_alt_tab_active
    try:
        if not is_alt_tab_active:
            pyautogui.keyDown('alt')
            is_alt_tab_active = True
        direction = data.get('dir', 'right')
        if direction == 'left':
            pyautogui.hotkey('shift', 'tab')
        else:
            pyautogui.press('tab')
    except Exception:
        pass

@socketio.on('alt_tab_end')
def handle_alt_tab_end():
    release_alt()

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

if __name__ == '__main__':
    local_ip = get_local_ip()
    url = f"http://{local_ip}:5000"
    
    print("\n" + "="*45)
    print(" 🚀 TOUCHPAD SERVER RUNNING ".center(45))
    print("="*45)
    print(f" Connect your phone to: {url}")
    print("\n Or scan this QR code:\n")
    
    qr = qrcode.QRCode(version=1, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    qr.print_ascii()
    print("="*45 + "\n")
    
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)