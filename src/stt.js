// Speech-to-text fallback for videos without captions: video audio -> Deepgram live websocket.
globalThis.YTLTStt = (() => {
  const ENDPOINT = 'wss://api.deepgram.com/v1/listen';
  const MAX_HANDSHAKE_FAILURES = 3;
  const MAX_BUFFER_CHARS = 160;

  function buildUrl(language) {
    const params = new URLSearchParams({
      // nova-3 handles auto-detect ("multi") and English best; nova-2 covers the widest language list.
      model: language === 'multi' || language === 'en' ? 'nova-3' : 'nova-2',
      language,
      smart_format: 'true',
      punctuate: 'true',
      interim_results: 'true',
      endpointing: '300',
      utterance_end_ms: '1000',
    });
    return `${ENDPOINT}?${params}`;
  }

  class DeepgramStream {
    // onUtterance(text): a finished phrase; onError(message): fatal, the stream has stopped.
    constructor({ key, language, onUtterance, onError }) {
      Object.assign(this, { key, language, onUtterance, onError });
      this.running = false;
      this.buffer = '';
      this.handshakeFailures = 0;
    }

    start(video) {
      if (this.running) return;
      this.running = true;
      this.video = video;
      this._connect();
    }

    stop() {
      this.running = false;
      this.buffer = '';
      clearTimeout(this.reconnectTimer);
      this._teardown();
    }

    // Drop text heard before a seek.
    reset() {
      this.buffer = '';
    }

    _connect() {
      if (!this.running) return;
      let stream;
      try {
        stream = this.video.captureStream();
      } catch (err) {
        return this._fail(YTLT_I18N.t('audioCaptureFailed', [err.message]));
      }
      const tracks = stream.getAudioTracks();
      if (!tracks.length) return this._scheduleReconnect(1000); // media not loaded yet

      const ws = new WebSocket(buildUrl(this.language), ['token', this.key]);
      this.ws = ws;
      let opened = false;

      ws.onopen = () => {
        opened = true;
        this.handshakeFailures = 0;
        this._startRecorder(new MediaStream(tracks));
        this.keepAlive = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }));
        }, 4000);
      };
      ws.onmessage = (e) => this._onMessage(e.data);
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this._teardown();
        if (!this.running) return;
        // Browsers hide the HTTP status of a failed handshake; repeated failures almost always mean a bad key.
        if (!opened && ++this.handshakeFailures >= MAX_HANDSHAKE_FAILURES) {
          return this._fail(YTLT_I18N.t('deepgramConnectFailed'));
        }
        this._scheduleReconnect(opened ? 500 : 2000 * this.handshakeFailures);
      };
    }

    _startRecorder(stream) {
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      this.recorder = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size && this.ws?.readyState === WebSocket.OPEN) this.ws.send(e.data);
      };
      // Source swapped (ad, next video, quality change): restart with a fresh container stream.
      const restart = () => {
        if (this.running && this.recorder === rec) {
          this._teardown();
          this._scheduleReconnect(300);
        }
      };
      rec.onstop = restart;
      rec.onerror = restart;
      stream.getAudioTracks().forEach((t) => t.addEventListener('ended', restart));
      rec.start(250);
    }

    _onMessage(data) {
      let msg;
      try { msg = JSON.parse(data); } catch (_) { return; }
      if (msg.type === 'Results') {
        const text = msg.channel?.alternatives?.[0]?.transcript?.trim() || '';
        if (msg.is_final && text) this.buffer = `${this.buffer} ${text}`.trim();
        const sentenceDone = /[.!?…]$/.test(this.buffer) && this.buffer.length > 60;
        if ((msg.speech_final && this.buffer) || sentenceDone || this.buffer.length > MAX_BUFFER_CHARS) this._flush();
      } else if (msg.type === 'UtteranceEnd') {
        this._flush();
      }
    }

    _flush() {
      const text = this.buffer;
      this.buffer = '';
      if (text) this.onUtterance?.(text);
    }

    _scheduleReconnect(delay) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this._connect(), delay);
    }

    _teardown() {
      clearInterval(this.keepAlive);
      const rec = this.recorder;
      this.recorder = null;
      if (rec && rec.state !== 'inactive') {
        try { rec.stop(); } catch (_) {}
      }
      const ws = this.ws;
      this.ws = null;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch (_) {}
        ws.close();
      } else if (ws && ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }

    _fail(message) {
      this.stop();
      this.onError?.(message);
    }
  }

  return { DeepgramStream, buildUrl };
})();
