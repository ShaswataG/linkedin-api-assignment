import json, base64

har_file_path = '*.har'

with open(har_file_path, encoding='utf-8') as f:
    har = json.load(f)

for entry in har['log']['entries']:
    if 'profileCardsExperienceOnly' in entry['request']['url']:
        content = entry['response']['content']
        decoded = base64.b64decode(content['text']).decode('utf-8')
        with open('experience-response.txt', 'w', encoding='utf-8') as out:
            out.write(decoded)
        break