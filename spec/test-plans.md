# Test Plans

Acceptance tests verifying end-to-end behaviour.

## AT-1 Voice connectivity
Given both roles joined, when Facilitator and Explorer unmute mics, then each hears the other with round-trip audio latency < 200 ms measured via getStats.

## AT-2 Data channel and clock sync
Given connected peers, when Facilitator sends periodic `clock.ping`, Explorer replies with `clock.pong` within 150 ms and the calculated clock offset stabilises within ±50 ms over WAN.

## AT-3 Asset preload
Given an `asset.manifest` of two files (5–10 MB each), when Explorer drag-drops matching files, `asset.presence.have` eventually lists both ids.

## AT-4 Program play & stop
When Facilitator issues `cmd.play` with `atPeerTime = now + 0.5`, Explorer starts playback within ±50 ms of the scheduled time. Sending `cmd.stop` ceases audio cleanly.

## AT-5 Crossfade
When `cmd.crossfade` is sent from A to B over 3 s, Explorer produces a smooth equal-power crossfade with no audible clicks.

## AT-6 Ducking
With ducking enabled (reduce by −9 dB), when Facilitator speaks above threshold, Explorer program level reduces within 80 ms and returns after 500 ms of silence.

## AT-7 Poor network / TURN
Under symmetric NAT conditions, connection establishes via TURN and voice quality remains intelligible while control messages stay reliable.

## AT-8 Consent & recording (optional)
When Explorer toggles recording on and starts/stops, a file is produced locally containing mic and program audio according to settings.
