import json
import base64

HAR_PATH = './har_collection/sp35.har'  # change per profile
COMPONENT_ID = 'profileCardsExperienceOnly'
OUTPUT_PATH = 'experience-response.txt'

with open(HAR_PATH, encoding='utf-8') as f:
    har = json.load(f)

matches_found = 0
saved = False

for entry in har['log']['entries']:
    url = entry['request']['url']
    if COMPONENT_ID not in url:
        continue

    matches_found += 1
    method = entry['request']['method']
    status = entry['response']['status']
    content = entry['response'].get('content', {})

    print(f"Match #{matches_found}: method={method} status={status} "
          f"has_text={'text' in content} mimeType={content.get('mimeType')}")

    # Only a real POST with a 200 and an actual body is a candidate.
    if method != 'POST' or status != 200 or 'text' not in content:
        continue

    text = content['text']
    encoding = content.get('encoding')
    decoded = base64.b64decode(text).decode('utf-8', errors='replace') if encoding == 'base64' else text

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as out:
        out.write(decoded)

    print(f"Saved decoded response ({len(decoded)} chars) to {OUTPUT_PATH}")
    saved = True
    break  # stop at the first valid match — remove this if a profile
           # genuinely has multiple valid component responses to inspect

if not saved:
    print(f"No usable response found among {matches_found} matching entries. "
          f"See the per-match diagnostics above to see why each was skipped.")