/* A picture that fails to load (a Mii that was never rendered, a web-only player with no Mii)
 * is swapped for the OpenPak default avatar, once, so no page shows a broken image. */

const FALLBACK = '/assets/web/images/avatar-default.png';

document.addEventListener('error', (e) => {
	const el = e.target;
	if (!(el instanceof HTMLImageElement) || el.dataset.avatarFallback === '1') {
		return;
	}
	// Only people's pictures: their URLs contain /mii/
	if (!/\/mii\//.test(el.src)) {
		return;
	}
	el.dataset.avatarFallback = '1';
	el.src = FALLBACK;
}, true);
