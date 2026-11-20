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

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('move')
def handle_move(data):
    try:
        pyautogui.moveRel(data['dx'], data['dy'])
    except Exception:
        pass

@socketio.on('scroll')
def handle_scroll(data):
    try:
        pyautogui.scroll(int(data['dy']))
    except Exception:
        pass

@socketio.on('click')
def handle_click(data):
    try:
        if data.get('double'):
            pyautogui.doubleClick(button=data.get('button', 'left'))
        else:
            pyautogui.click(button=data.get('button', 'left'))
    except Exception:
        pass

@socketio.on('key_press')
def handle_key(data):
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
    try:
        keys = data.get('keys', [])
        pyautogui.hotkey(*keys)
    except Exception:
        pass

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