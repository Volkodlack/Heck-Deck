/**
 * Lancement des différents modes de jeu.
 */
import type { JoinPayload } from '@shared';
import { net } from './net/proxy';
import { setTutorial } from './socket';
import { LocalHost, P2PGuest, ServerLink } from './net/backends';
import type { Session } from './session';

export const payloadOf = (s: Session): JoinPayload => ({ name: s.name, cosmetics: s.cosmetics, accountId: s.kind === 'user' ? s.userId : undefined });

/** Partie solo hors-ligne contre des bots (lobby local, l'hôte peut ajuster les bots). */
export async function playSolo(s: Session, bots = 3) {
  const host = new LocalHost(payloadOf(s), { bots });
  net.attach(host);
  await host.start();
}

/** Tutoriel : 3 bots, tu es forcément Survivant, la partie démarre directement. */
export async function playTutorial(s: Session) {
  const host = new LocalHost(payloadOf(s), { bots: 3, forcedRole: 'survivor', autoStart: true, maxPlayers: 4 });
  net.attach(host);
  setTutorial(true);
  await host.start();
}

/** Héberger une partie en ligne depuis cet appareil (P2P). Retourne le code de salle. */
export async function hostOnline(s: Session): Promise<string> {
  const host = new LocalHost(payloadOf(s), { p2p: true });
  try {
    await host.start();
  } catch (e) {
    host.close();
    throw e;
  }
  net.attach(host);
  return host.code;
}

/** Rejoindre la partie d'un autre joueur via son code. */
export async function joinOnline(code: string, s: Session) {
  const guest = new P2PGuest(code.toUpperCase(), payloadOf(s));
  try {
    await guest.connect();
  } catch (e) {
    guest.close();
    throw e;
  }
  net.attach(guest);
}

/** Serveur dédié auto-hébergé : création ou jonction d'une salle sur ce serveur. */
export async function joinServer(url: string, s: Session, code?: string) {
  const link = new ServerLink(url.replace(/\/$/, ''));
  try {
    await link.waitConnected();
  } catch (e) {
    link.close();
    throw e;
  }
  net.attach(link);
  const res = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    if (code) net.emit('lobby:join', { ...payloadOf(s), code: code.toUpperCase() }, resolve);
    else net.emit('lobby:create', payloadOf(s), resolve);
  });
  if (!res.ok) { net.detach('rejected'); throw new Error(res.error ?? 'Refusé par le serveur.'); }
}
