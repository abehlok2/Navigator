export interface AudioQualityMetrics {
  bitrate: number;
  packetLoss: number;
  jitter: number;
  audioLevel: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
}

export class AudioQualityMonitor {
  private pc: RTCPeerConnection;
  private lastStats: RTCStatsReport | null = null;
  private lastTimestamp = 0;
  private analyser: AnalyserNode | null = null;
  private analyserBuffer: Uint8Array | null = null;

  constructor(peerConnection: RTCPeerConnection, analyser?: AnalyserNode | null) {
    this.pc = peerConnection;
    if (analyser) {
      this.setAnalyser(analyser);
    }
  }

  setAnalyser(analyser: AnalyserNode | null) {
    this.analyser = analyser;
    this.analyserBuffer = null;
  }

  async getMetrics(): Promise<AudioQualityMetrics> {
    const stats = await this.pc.getStats();
    const now = Date.now();

    let bitrate = 0;
    let packetLoss = 0;
    let jitter = 0;

    stats.forEach(report => {
      if (report.type === 'inbound-rtp' && (report as RTCInboundRtpStreamStats).kind === 'audio') {
        const inbound = report as RTCInboundRtpStreamStats;
        if (this.lastStats && this.lastTimestamp) {
          const previous = Array.from(this.lastStats.values()).find(
            previousReport =>
              previousReport.type === 'inbound-rtp' && previousReport.id === report.id,
          ) as RTCInboundRtpStreamStats | undefined;
          if (previous) {
            const bytesReceived = (inbound.bytesReceived ?? 0) - (previous.bytesReceived ?? 0);
            const timeDiff = Math.max((now - this.lastTimestamp) / 1000, 0.001);
            if (bytesReceived > 0) {
              bitrate = (bytesReceived * 8) / timeDiff;
            }
          }
        }

        const packetsLost = inbound.packetsLost ?? 0;
        const packetsReceived = inbound.packetsReceived ?? 0;
        const totalPackets = packetsReceived + packetsLost;
        if (totalPackets > 0) {
          packetLoss = (packetsLost / totalPackets) * 100;
        }

        jitter = inbound.jitter ?? 0;
      }
    });

    this.lastStats = stats;
    this.lastTimestamp = now;

    const audioLevel = this.measureAudioLevel();
    const quality = this.determineQuality(bitrate, packetLoss, jitter);

    return {
      bitrate,
      packetLoss,
      jitter,
      audioLevel,
      quality,
    };
  }

  private determineQuality(
    bitrate: number,
    packetLoss: number,
    jitter: number,
  ): 'excellent' | 'good' | 'fair' | 'poor' {
    if (bitrate > 100_000 && packetLoss < 1 && jitter < 0.03) {
      return 'excellent';
    }

    if (bitrate > 64_000 && packetLoss < 3 && jitter < 0.05) {
      return 'good';
    }

    if (bitrate > 32_000 && packetLoss < 5 && jitter < 0.1) {
      return 'fair';
    }

    return 'poor';
  }

  private measureAudioLevel(): number {
    const analyser = this.analyser;
    if (!analyser) return 0;
    if (!this.analyserBuffer || this.analyserBuffer.length !== analyser.fftSize) {
      this.analyserBuffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    }
    const buffer = this.analyserBuffer as Uint8Array<ArrayBuffer>;
    if (!buffer) return 0;
    analyser.getByteTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const sample = buffer[i] - 128;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / buffer.length);
    return Math.max(0, Math.min(1, rms / 128));
  }
}
