import { useEffect, useRef, useState } from 'react';
import { socket, useGame } from '../lib/socket';

export default function ChatBox({ className = '', disabled = false }: { className?: string; disabled?: boolean }) {
  const { chat } = useGame();
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [chat.length]);

  return (
    <div className={`panel p-3 flex flex-col gap-2 min-h-0 ${className}`}>
      <div ref={list} className="flex-1 overflow-y-auto text-sm space-y-1 pr-1 min-h-0">
        {chat.map((m) => (
          <p key={m.id} className={m.system ? 'text-toxic/80 italic' : ''}>
            {!m.system && <b className="text-hexviolet">{m.name} : </b>}
            {m.text}
          </p>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { socket.emit('chat', text); setText(''); } }}>
        <input className="input !py-1 text-sm" value={text} onChange={(e) => setText(e.target.value)} maxLength={200}
          placeholder={disabled ? 'Les morts ne parlent pas…' : 'Écris un message…'} disabled={disabled}
          onKeyDown={(e) => e.stopPropagation()} />
        <button className="btn-violet !text-base !px-3" disabled={disabled}>➤</button>
      </form>
    </div>
  );
}
