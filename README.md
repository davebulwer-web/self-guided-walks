# Self-guided walks

A phone web app for self-guided walks. It shows a route's stops on a map,
uses the phone's GPS to guide you to the next stop, and tells you when you
have arrived. Each stop has a description, optional photos, and links to
Google Maps for walking or bus/train directions.

## Adding a new walk

1. Copy `routes/uckfield-lunch.json` to a new file, for example `routes/my-walk.json`.
2. Change the title, summary and stops. Each stop needs a `name`, `lat`, `lng` and `text`.
   `photos` is a list of image paths or web addresses, e.g. `["photos/station.jpg"]`.
3. Open the app with `?route=my-walk` on the end of its address.

To get a stop's position, long-press the spot in Google Maps and copy the two
numbers it shows, or stand at the spot and use "Move pin to where I am" in the app.

Leaflet 1.9.4 (BSD-2-Clause) is included in `vendor/leaflet`. Map data © OpenStreetMap contributors.
