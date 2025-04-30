import json, base64, requests, os

raw_json = '''{"event":"messages.upsert","instance":"Closer","data":{"key":{"remoteJid":"51923559154@s.whatsapp.net","fromMe":false,"id":"0810204B0D16C5AED7C320D93DC09180"},"pushName":"Diego Pacheco","status":"DELIVERY_ACK","message":{"audioMessage":{"url":"https://mmg.whatsapp.net/...","mimetype":"audio/ogg; codecs=opus","fileSha256":"…","fileLength":"3194","seconds":1,"ptt":true,"mediaKey":"u4WMMUXk7F97bYHqsiW1oj+csGmL93riMWgJ4lcZVgo=","fileEncSha256":"…","directPath":"/v/t62.7117-24/...","mediaKeyTimestamp":"1745980529","waveform":"AAAA…"}},"messageType":"audioMessage","messageTimestamp":1745980529},"destination":"https://d945-38-253-158-50.ngrok-free.app/api/closer/chat","server_url":"http://localhost:8080","apikey":"D52EE71B9351-4C74-920C-7D250B0656EA"}'''

data       = json.loads(raw_json)
message_id = data['data']['key']['id']
instance   = data['instance']
server     = data['server_url']
api_key    = data['apikey']

endpoint = f"{server}/chat/getBase64FromMediaMessage/{instance}"
payload  = {'message': {'key': {'id': message_id}}, 'convertToMp4': False}
headers  = {'Content-Type': 'application/json', 'apikey': api_key}

resp = requests.post(endpoint, json=payload, headers=headers)
b64  = resp.json().get('base64', '')

audio_bytes = base64.b64decode(b64)
os.makedirs('downloads', exist_ok=True)
with open(f"downloads/{message_id}.ogg", 'wb') as f:
    f.write(audio_bytes)

print(f"Audio guardado en downloads/{message_id}.ogg")
