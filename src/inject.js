// Runs in the page's MAIN world. YouTube signs its subtitle requests (pot token),
// so instead of fetching captions ourselves we copy the responses the player gets.
(() => {
  const SOURCE = 'yt-live-translate';
  const isTimedText = (url) => typeof url === 'string' && url.includes('/api/timedtext');
  const emit = (url, text) => {
    if (text) window.postMessage({ source: SOURCE, type: 'timedtext', url, text }, '*');
  };

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const res = await origFetch.apply(this, arguments);
    try {
      const url = input instanceof Request ? input.url : String(input);
      if (isTimedText(url)) res.clone().text().then((t) => emit(url, t), () => {});
    } catch (_) {}
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__ytltUrl = String(url);
    return origOpen.apply(this, arguments);
  };

  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (isTimedText(this.__ytltUrl)) {
      this.addEventListener('load', () => {
        try {
          const body = this.responseType === '' || this.responseType === 'text'
            ? this.responseText
            : typeof this.response === 'string' ? this.response : JSON.stringify(this.response);
          emit(this.__ytltUrl, body);
        } catch (_) {}
      });
    }
    return origSend.apply(this, arguments);
  };
})();
