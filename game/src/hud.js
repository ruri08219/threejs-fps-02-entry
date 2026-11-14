// The HUD: every number the player needs, and nothing else. Health, armour, ammo,
// money, timer, score, who is still alive, the killfeed, and the buy menu. The
// overlays (start, pause, round end, match end) are one panel with four faces.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    health: $('health-value'), healthBar: $('health-bar'),
    armor: $('armor-value'), ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'),
    money: $('money-value'), timer: $('timer-value'), scoreV: $('score-v'), scoreS: $('score-s'),
    aliveV: $('alive-v'), aliveS: $('alive-s'), round: $('round-value'),
    killfeed: $('killfeed'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    damage: $('damage-vignette'), bomb: $('bomb-status'), progress: $('progress'),
    progressFill: $('progress-fill'), progressLabel: $('progress-label'),
    overlay: $('overlay'), overlayTitle: $('overlay-title'), overlayCopy: $('overlay-copy'),
    play: $('play'), buy: $('buy-menu'), buyList: $('buy-list'),
    banner: $('banner'),
  };

  let hitTimer = null;
  let bannerTimer = null;

  function setText(el, value) {
    if (el && el.textContent !== String(value)) el.textContent = String(value);
  }

  return {
    setHealth(health, armor) {
      setText(els.health, Math.ceil(health));
      setText(els.armor, Math.ceil(armor));
      if (els.healthBar) els.healthBar.style.width = `${Math.max(0, health)}%`;
      if (els.health) els.health.classList.toggle('low', health <= 30);
    },
    setAmmo(mag, reserve) {
      setText(els.ammoMag, mag);
      setText(els.ammoReserve, `/ ${reserve}`);
    },
    setMoney(money) { setText(els.money, `$${money}`); },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(els.timer, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      if (els.timer) els.timer.classList.toggle('buy', phase === 'buy');
    },
    setScore(v, s, round) {
      setText(els.scoreV, v);
      setText(els.scoreS, s);
      setText(els.round, `ROUND ${round}`);
    },
    setAlive(v, s) {
      setText(els.aliveV, v);
      setText(els.aliveS, s);
    },
    setWeaponName(name) { setText($('weapon-name'), name); },
    setGrenades(count) { setText($('grenade-count'), count > 0 ? `G ×${count}` : ''); },
    setCrosshairSpread(px) {
      if (els.crosshair) els.crosshair.style.setProperty('--gap', `${px}px`);
    },
    hitMarker(kill) {
      if (!els.hitmarker) return;
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', !!kill);
      if (hitTimer) clearTimeout(hitTimer);
      hitTimer = setTimeout(() => els.hitmarker.classList.remove('on', 'kill'), kill ? 220 : 120);
    },
    damageFlash() {
      if (!els.damage) return;
      els.damage.classList.add('on');
      setTimeout(() => els.damage.classList.remove('on'), 180);
    },
    killfeed(text, good) {
      if (!els.killfeed) return;
      const line = document.createElement('div');
      line.className = good ? 'feed-line good' : 'feed-line';
      line.textContent = text;
      els.killfeed.prepend(line);
      while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
      setTimeout(() => line.remove(), 6000);
    },
    banner(text, ms = 2600) {
      if (!els.banner) return;
      els.banner.textContent = text;
      els.banner.classList.add('on');
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => els.banner.classList.remove('on'), ms);
    },
    hideBanner() {
      if (!els.banner) return;
      if (bannerTimer) clearTimeout(bannerTimer);
      els.banner.classList.remove('on');
    },
    setBombStatus(text) { setText(els.bomb, text); },
    setProgress(label, frac) {
      if (!els.progress) return;
      if (!label) { els.progress.hidden = true; return; }
      els.progress.hidden = false;
      setText(els.progressLabel, label);
      if (els.progressFill) els.progressFill.style.width = `${Math.round(frac * 100)}%`;
    },
    showOverlay(kind, data) {
      if (!els.overlay) return;
      els.overlay.hidden = false;
      const titles = {
        start: 'ASHFALL PROTOCOL',
        paused: 'PAUSED',
        round: data && data.winner === 'vanguard' ? 'ROUND WON' : 'ROUND LOST',
        match: data && data.matchWinner === 'vanguard' ? 'MATCH WON' : 'MATCH LOST',
        dead: 'YOU ARE DOWN',
      };
      const copies = {
        start: 'Vanguard attacks the Kestrel freight yard. Plant the spike at site A or B — or wipe out Sentinel. Buy in the 15 second window, then move.',
        paused: 'Click to keep playing. Your team is waiting.',
        round: `${data ? data.reason : ''} — next round starts shortly.`,
        match: data ? (data.matchWinner === 'vanguard'
          ? `Vanguard takes the yard ${data.scoreV}–${data.scoreS}. The spike never stood a chance.`
          : `Sentinel holds the yard ${data.scoreS}–${data.scoreV}. Regroup and run it back.`) : '',
        dead: 'Sentinel got you. Your squad fights on — watch them finish it.',
      };
      setText(els.overlayTitle, titles[kind] ?? 'ASHFALL PROTOCOL');
      setText(els.overlayCopy, copies[kind] ?? '');
      if (els.play) els.play.textContent = kind === 'start' ? 'Deploy' : kind === 'match' ? 'Play again' : 'Resume';
    },
    hideOverlay() { if (els.overlay) els.overlay.hidden = true; },
    onPlay(callback) { if (els.play) els.play.addEventListener('click', callback); },
    showBuy(items, money, onBuy) {
      if (!els.buy) return;
      els.buy.hidden = false;
      els.buyList.innerHTML = '';
      for (const item of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.disabled = money < item.price;
        row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-price">$${item.price}</span>`;
        row.addEventListener('click', () => onBuy(item.id));
        els.buyList.appendChild(row);
      }
    },
    hideBuy() { if (els.buy) els.buy.hidden = true; },
    setBuyMoney(money) {
      const el = $('buy-money');
      setText(el, `$${money} to spend`);
    },
  };
}
