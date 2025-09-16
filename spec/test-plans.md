# Test Plans

Acceptance tests verifying end-to-end behaviour.

## AT-1 Voice connectivity
Given both roles joined, when Facilitator and Explorer unmute mics, then each hears the other with round-trip audio latency < 200 ms measured via getStats.

## AT-2 Data channel and clock sync
Given connected peers, when Facilitator sends periodic `clock.ping`, Explorer replies with `clock.pong` within 150 ms and the calculated clock offset stabilises within ±50 ms over WAN.

## AT-3 Asset preload
Given an `asset.manifest` of two files (5–10 MB each), when Explorer drag-drops matching files, `asset.presence.have` eventually lists both ids.

## AT-4 Remote load / unload / seek
Given a manifest entry for `tone` and a reachable HTTPS source, when Facilitator sends `cmd.load` with that source, Explorer acknowledges success, decodes the file, and updates `asset.presence.have` to include `tone`. After starting playback, issuing `cmd.seek` to 12.5 s moves playback within 100 ms. Sending `cmd.unload` stops playback and `asset.presence.missing` lists `tone` again.

## AT-5 Program play & stop
When Facilitator issues `cmd.play` with `atPeerTime = now + 0.5`, Explorer starts playback within ±50 ms of the scheduled time. Sending `cmd.stop` ceases audio cleanly.

## AT-6 Crossfade
When `cmd.crossfade` is sent from A to B over 3 s, Explorer produces a smooth equal-power crossfade with no audible clicks.

## AT-7 Ducking
With ducking enabled (reduce by −9 dB), when Facilitator speaks above threshold, Explorer program level reduces within 80 ms and returns after 500 ms of silence.

## AT-8 Poor network / TURN
Under symmetric NAT conditions, connection establishes via TURN and voice quality remains intelligible while control messages stay reliable.

## AT-9 Consent & recording (optional)
When Explorer toggles recording on and starts/stops, a file is produced locally containing mic and program audio according to settings.
