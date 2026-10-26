# Self-guided walks

A phone web app for self-guided walks. It shows a route's stops on a map,
uses the phone's GPS to guide you to the next stop, and tells you when you
have arrived. Each stop has a description, optional photos, and links to
Google Maps for walking or bus/train directions.

## Adding a new walk

Open `editor.html` (for example https://davebulwer-web.github.io/self-guided-walks/editor.html).

1. Tap the map to drop each stop in order, or use "Add stop where I am". Drag pins to fine-tune.
2. Give each stop a name, some text and photos. Photos are shrunk on the device before upload.
3. Press Preview to try the walk, then Publish.

Publishing writes `routes/<walk>.json`, the photos in `photos/`, and the list in
`routes/index.json` straight to this repository using a fine-grained GitHub
access key (Contents: read and write, this repository only), which is stored
only in the browser you publish from.

Walks are plain JSON files, so they can also be edited by hand. Each stop needs
`name`, `lat`, `lng` and `text`; `photos` is a list of paths or `{src, caption}`.

Leaflet 1.9.4 (BSD-2-Clause) is included in `vendor/leaflet`. Map data © OpenStreetMap contributors.
