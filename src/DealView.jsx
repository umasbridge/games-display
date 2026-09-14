import React, { useState, useEffect, useMemo } from 'react';
import HandDiagram from './HandDiagram.jsx';
import { TravellerTable } from './TravellerTable.jsx';
import { buildTeamRows, buildPairRows } from './boardUtils.js';

export default function DealView({ supabase, analysis, userId, onBack, DiscussionView }) {
  const [boards, setBoards] = useState([]);
  const [results, setResults] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notesUnread, setNotesUnread] = useState({});
  const [activePopup, setActivePopup] = useState(null); // { boardId, type }
  const [notesDiscussions, setNotesDiscussions] = useState({});
  const [notesLoading, setNotesLoading] = useState({});

  const event = analysis.bg_events;
  const tournament = event?.bg_tournaments;
  const filters = analysis.filters || {};
  const isTeams = event?.type === 'teams';
  const eventScoring = filters.event_scoring
    || filters.selections?.find(s => s.event_id === event?.id)?.event_scoring
    || filters.selections?.[0]?.event_scoring
    || event?.scoring;
  const scoringKey = String(eventScoring || '').toLowerCase();

  const participantEventIds = useMemo(() => {
    if (filters.selections?.length) {
      return [...new Set(filters.selections.map(s => s.event_id).filter(Boolean))];
    }
    if (filters.event_ids?.length) return filters.event_ids;
    return event?.id ? [event.id] : [];
  }, [filters.selections, filters.event_ids, event?.id]);

  useEffect(() => {
    if (!event?.id) return;
    setLoading(true);

    const participantPromise = participantEventIds.length === 0
      ? Promise.resolve([])
      : (participantEventIds.length === 1
          ? supabase.from('bg_participants').select('id, number, name, roster').eq('event_id', participantEventIds[0]).order('number')
          : supabase.from('bg_participants').select('id, number, name, roster').in('event_id', participantEventIds).order('number')
        ).then(({ data }) => data || []);

    if (filters.board_ids?.length) {
      const boardIds = filters.board_ids;
      const fetchResultsForBoards = async () => {
        const all = [];
        let from = 0;
        while (true) {
          const { data } = await supabase.from('bg_board_results').select('*').in('board_id', boardIds).order('id').range(from, from + 999);
          if (!data?.length) break;
          all.push(...data);
          if (data.length < 1000) break;
          from += 1000;
        }
        return all;
      };

      Promise.all([
        supabase.from('bg_boards').select('*').in('id', boardIds).order('board_number').then(({ data }) => data || []),
        fetchResultsForBoards(),
        participantPromise,
      ]).then(([boards, results, parts]) => {
        setBoards(boards);
        setResults(results);
        setParticipants(parts);
        setLoading(false);
      });
      return;
    }

    let stageQuery;
    if (filters.stage_ids?.length) {
      stageQuery = supabase.from('bg_stages').select('id').in('id', filters.stage_ids);
    } else if (filters.stage_id) {
      stageQuery = supabase.from('bg_stages').select('id').eq('id', filters.stage_id);
    } else {
      stageQuery = supabase.from('bg_stages').select('id').eq('event_id', event.id);
    }

    stageQuery.then(({ data: stages }) => {
      const stageIds = (stages || []).map(s => s.id);
      if (!stageIds.length) { setLoading(false); return null; }

      const fetchAllResults = async () => {
        const all = [];
        let from = 0;
        while (true) {
          const { data } = await supabase.from('bg_board_results').select('*').in('stage_id', stageIds).order('id').range(from, from + 999);
          if (!data?.length) break;
          all.push(...data);
          if (data.length < 1000) break;
          from += 1000;
        }
        return all;
      };

      return Promise.all([
        supabase.from('bg_boards').select('*').in('stage_id', stageIds).order('board_number').then(({ data }) => data || []),
        fetchAllResults(),
        participantPromise,
      ]);
    }).then((res) => {
      if (!res) return;
      const [boards, results, parts] = res;
      setBoards(boards);
      setResults(results);
      setParticipants(parts);
      setLoading(false);
    });
  }, [analysis?.id]);

  useEffect(() => {
    if (!analysis?.id || !userId) return;
    supabase.rpc('get_game_notes_unread', { p_analysis_id: analysis.id }).then(({ data }) => {
      if (!data) return;
      const m = {};
      for (const r of data) {
        const boardId = (r.resource_id || '').split(':')[1];
        if (boardId) m[boardId] = Number(r.unread_count) || 0;
      }
      setNotesUnread(m);
    }, () => {});
  }, [analysis?.id, userId]);

  const handleOpenNotes = async (board, boardNumber) => {
    const boardId = board.id;
    setNotesUnread(m => ({ ...m, [boardId]: 0 }));

    if (notesDiscussions[boardId]) {
      setActivePopup(prev => prev?.boardId === boardId && prev?.type === 'notes' ? null : { boardId, type: 'notes' });
      return;
    }

    setNotesLoading(m => ({ ...m, [boardId]: true }));
    const resourceId = `${analysis.id}:${boardId}`;
    const resourceType = 'game_board';

    try {
      const { data: existing, error: findErr } = await supabase
        .from('discussions')
        .select('id, name, created_by')
        .eq('resource_type', resourceType)
        .eq('resource_id', resourceId)
        .limit(1);

      if (findErr) { console.error('Find discussion error:', findErr); setNotesLoading(m => ({ ...m, [boardId]: false })); return; }

      let disc = existing?.[0];
      if (disc) {
        const { error: joinErr } = await supabase.from('discussion_members').insert({ discussion_id: disc.id, user_id: userId });
        if (joinErr && !joinErr.message?.includes('duplicate')) console.error('Join error:', joinErr);
      }
      if (!disc) {
        const { data: created, error: createErr } = await supabase
          .from('discussions')
          .insert({ name: `Board ${boardNumber} Notes`, created_by: userId, resource_type: resourceType, resource_id: resourceId })
          .select('id, name, created_by')
          .single();

        if (createErr) { console.error('Create discussion error:', createErr); setNotesLoading(m => ({ ...m, [boardId]: false })); return; }

        if (created) {
          const members = [{ discussion_id: created.id, user_id: userId }];
          for (const s of (filters.shared_with || [])) {
            if (s.userId && s.userId !== userId) members.push({ discussion_id: created.id, user_id: s.userId });
          }
          for (const m of members) {
            await supabase.from('discussion_members').insert(m).then(() => {}, () => {});
          }
          disc = created;
        }
      }

      if (disc) {
        setNotesDiscussions(m => ({ ...m, [boardId]: disc }));
        setActivePopup({ boardId, type: 'notes' });
      } else {
        alert('Could not create or find discussion. Check browser console.');
      }
    } catch (e) {
      console.error('Notes error:', e);
      alert('Notes error: ' + e.message);
    }
    setNotesLoading(m => ({ ...m, [boardId]: false }));
  };

  const participantMap = useMemo(() => {
    const m = {};
    for (const p of participants) m[p.id] = p;
    return m;
  }, [participants]);

  const resultsByBoard = useMemo(() => {
    const m = {};
    for (const r of results) {
      if (!m[r.board_id]) m[r.board_id] = [];
      m[r.board_id].push(r);
    }
    return m;
  }, [results]);

  const normalizedRows = useMemo(() => {
    if (!boards.length || !results.length) return [];
    if (isTeams) {
      const teamRows = buildTeamRows(boards, results, filters);
      if (teamRows.length > 0) return teamRows;
    }
    return buildPairRows(boards, results, filters);
  }, [boards, results, filters, isTeams]);

  const effectiveIsTeams = isTeams || normalizedRows.some(r => r.otherRoom != null);

  const displayBoards = useMemo(() => {
    const matchKeySet = filters.match_keys?.length ? new Set(filters.match_keys) : null;
    return normalizedRows.map(row => {
      const allBoardResults = resultsByBoard[row.board?.id] || [];
      const boardResults = matchKeySet
        ? allBoardResults.filter(r => r.match_id && matchKeySet.has(`${r.board_id}__${r.match_id}__${r.round ?? ''}`))
        : allBoardResults;
      return { ...row, boardNumber: row.displayBoardNumber ?? row.board?.board_number, boardResults };
    });
  }, [normalizedRows, resultsByBoard, filters.match_keys]);

  const renderBoard = (displayBoard) => {
    const { board, result, otherRoom, boardNumber, boardResults } = displayBoard;
    if (!board) return null;
    const boardId = board.id;
    const popupType = activePopup?.boardId === boardId ? activePopup.type : null;
    const isImpPairs = !isTeams && (
      scoringKey.includes('imp')
      || scoringKey.includes('butler')
      || boardResults.some(r => r.imps_ns != null || Number(r.mp_ns) < 0 || Number(r.mp_ew) < 0)
    );

    return (
      <div key={`${boardId}:${result?.id}`} className="border-b-2 border-gray-400 relative mb-3 pb-2">
        <div className="px-2 py-1">
          <HandDiagram
            board={board}
            result={result}
            otherRoom={otherRoom}
            participantMap={participantMap}
            ourParticipantId={filters.participant_id}
            onOtherRoom={effectiveIsTeams && otherRoom ? () => setActivePopup(popupType === 'otherroom' ? null : { boardId, type: 'otherroom' }) : undefined}
            onTraveller={boardResults.length > 1 ? () => setActivePopup(popupType === 'traveller' ? null : { boardId, type: 'traveller' }) : undefined}
            onNotes={supabase ? () => handleOpenNotes(board, boardNumber) : undefined}
            notesLoading={notesLoading[boardId] || false}
            notesUnread={notesUnread[boardId] || 0}
            isTeams={effectiveIsTeams}
            isImpPairs={isImpPairs}
            boardNumber={boardNumber}
          />
        </div>

        {popupType && popupType !== 'notes' && (
          <TravellerPopup
            popup={popupType}
            board={board}
            result={result}
            otherRoom={otherRoom}
            boardResults={boardResults}
            participantMap={participantMap}
            highlightParticipantId={filters.participant_id}
            ourParticipantId={filters.participant_id}
            isTeams={effectiveIsTeams}
            scoring={eventScoring}
            onClose={() => setActivePopup(null)}
            boardNumber={boardNumber}
          />
        )}

        {popupType === 'notes' && notesDiscussions[boardId] && (
          <NotesPopup
            discussion={notesDiscussions[boardId]}
            supabase={supabase}
            userId={userId}
            onClose={() => setActivePopup(null)}
            boardNumber={boardNumber}
            analysisName={analysis.name}
            DiscussionView={DiscussionView}
          />
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-400">Loading boards...</p>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="border-b border-gray-200 px-3 py-2 flex items-center gap-2">
        <button onClick={onBack} className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-50">
          &larr; Back
        </button>
        <div>
          <h1 className="text-sm font-bold">{analysis.name}</h1>
          <p className="text-xs text-gray-500">
            {filters.board_ids?.length > 0
              ? `${filters.query_label || 'Smart query'} · ${displayBoards.length} boards`
              : filters.stage_ids?.length > 1
              ? `${filters.stage_ids.length} stages · ${displayBoards.length} boards`
              : `${tournament?.name} · ${displayBoards.length} boards`
            }
          </p>
        </div>
      </div>

      <div className="px-2 py-2">
        {displayBoards.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No boards match the selected filters.</div>
        ) : displayBoards.some(db => db.matchOpponentId) ? (
          (() => {
            const groups = [];
            for (const db of displayBoards) {
              const oppId = db.matchOpponentId;
              if (!groups.length || groups[groups.length - 1].oppId !== oppId) {
                groups.push({ oppId, boards: [] });
              }
              groups[groups.length - 1].boards.push(db);
            }
            return groups.map((group, gi) => {
              const rawName = participantMap[group.oppId]?.name || '';
              const oppName = rawName.replace(/\s*&\s*$/, '').trim();
              const totalImps = group.boards.reduce((sum, db) => sum + (db.ourImps ?? 0), 0);
              const impsStr = totalImps > 0 ? `+${totalImps}` : `${totalImps}`;
              const impsColor = totalImps > 0 ? '#15803d' : totalImps < 0 ? '#dc2626' : '#6b7280';
              return (
                <div key={`${group.oppId ?? ''}_${gi}`}>
                  <div style={{ background: '#f1f5f9', borderLeft: '3px solid #3b82f6', padding: '5px 10px', marginBottom: 2, marginTop: gi > 0 ? 8 : 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                      Match {gi + 1}{oppName ? ` — vs ${oppName}` : ''}
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: impsColor }}>{impsStr} IMPs</span>
                  </div>
                  {group.boards.map(renderBoard)}
                </div>
              );
            });
          })()
        ) : (
          displayBoards.map(renderBoard)
        )}
      </div>
    </div>
  );
}


function TravellerPopup({ popup, board, result, otherRoom, boardResults, participantMap,
                          highlightParticipantId, ourParticipantId, isTeams, scoring, onClose, boardNumber }) {
  const [pos, setPos] = React.useState(null);
  const dragRef = React.useRef(null);

  const handleMouseDown = (e) => {
    if (e.target.tagName === 'BUTTON') return;
    const el = dragRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (pos === null) setPos({ x: rect.left, y: rect.top });
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    const onMove = (ev) => setPos({ x: ev.clientX - startX, y: ev.clientY - startY });
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  };

  const popupTitle = popup === 'traveller' ? 'Traveller' : popup === 'otherroom' ? 'Other Room' : '';

  const popupContent = popup === 'traveller' ? (
    <TravellerTable
      board={board}
      boardResults={boardResults}
      participantMap={participantMap}
      highlightParticipantId={highlightParticipantId}
      isTeams={isTeams}
      scoring={scoring}
    />
  ) : popup === 'otherroom' && board && otherRoom ? (
    <HandDiagram
      board={board}
      result={otherRoom}
      otherRoom={null}
      participantMap={participantMap}
      ourParticipantId={ourParticipantId}
    />
  ) : null;

  const panelStyle = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, width: 'max-content', maxWidth: 'calc(100vw - 16px)', minWidth: 0, maxHeight: '90vh', zIndex: 30 }
    : { position: 'fixed', right: 0, top: 0, bottom: 0, width: 'max-content', maxWidth: 'calc(100vw - 16px)', minWidth: 0, zIndex: 30 };

  return (
    <>
      <div ref={dragRef} className="hidden md:flex flex-col bg-white border-l border-gray-200 shadow-lg overflow-hidden" style={panelStyle}>
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between flex-shrink-0"
             style={{ cursor: 'move' }} onMouseDown={handleMouseDown}>
          <span className="text-sm font-bold text-gray-700 select-none">Board {boardNumber} — {popupTitle}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>
        <div className="p-4 overflow-auto flex-1">{popupContent}</div>
      </div>

      <div className="md:hidden fixed inset-0 bg-white z-50 overflow-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
          <span className="text-sm font-bold text-gray-700">Board {boardNumber} — {popupTitle}</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-lg leading-none">&times;</button>
        </div>
        <div className="p-4">{popupContent}</div>
      </div>
    </>
  );
}


function NotesPopup({ discussion, supabase, userId, onClose, boardNumber, analysisName, DiscussionView }) {
  const [pos, setPos] = useState({ x: null, y: null });
  const dragRef = React.useRef(null);

  const handleMouseDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
    const el = dragRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const onMove = (ev) => setPos({ x: ev.clientX - offsetX, y: ev.clientY - offsetY });
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  if (DiscussionView) {
    const style = pos.x != null
      ? { position: 'fixed', left: pos.x, top: pos.y, zIndex: 50, cursor: 'move' }
      : { position: 'fixed', right: 0, top: 0, zIndex: 50, cursor: 'move' };

    return (
      <div ref={dragRef} style={style} onMouseDown={handleMouseDown} onClick={(e) => e.stopPropagation()}>
        <DiscussionView
          discussion={discussion}
          supabase={supabase}
          userId={userId}
          isOwner={discussion.created_by === userId}
          onClose={onClose}
          documentName={analysisName || ''}
          docId={null}
          hideUnlink
        />
      </div>
    );
  }

  return <NotesPopupFallback discussion={discussion} supabase={supabase} userId={userId} onClose={onClose} boardNumber={boardNumber} />;
}


function NotesPopupFallback({ discussion, supabase, userId, onClose, boardNumber }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    supabase
      .from('discussion_messages')
      .select('id, content, user_id, created_at')
      .eq('discussion_id', discussion.id)
      .eq('deleted', false)
      .order('created_at')
      .then(({ data }) => setMessages(data || []));
  }, [discussion.id]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    const { data } = await supabase
      .from('discussion_messages')
      .insert({ discussion_id: discussion.id, user_id: userId, content: text })
      .select('id, content, user_id, created_at')
      .single();
    if (data) setMessages(prev => [...prev, data]);
    setInput('');
    setSending(false);
  };

  const panel = (
    <>
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between z-10">
        <span className="text-sm font-bold text-gray-700">Board {boardNumber} — Notes</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3" style={{ minHeight: 200 }}>
        {messages.length === 0 && <p className="text-sm text-gray-400">No notes yet.</p>}
        {messages.map(m => (
          <div key={m.id} className={`text-sm ${m.user_id === userId ? 'text-right' : ''}`}>
            <div className={`inline-block px-3 py-2 rounded-lg max-w-[80%] ${m.user_id === userId ? 'bg-blue-100 text-gray-800' : 'bg-gray-100 text-gray-700'}`}>
              {m.content}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {new Date(m.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-200 p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Add a note..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
          autoFocus
        />
        <button onClick={handleSend} disabled={!input.trim() || sending}
          className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
          Send
        </button>
      </div>
    </>
  );

  return (
    <>
      <div className="hidden md:flex flex-col fixed right-0 top-0 bottom-0 bg-white border-l border-gray-200 shadow-lg z-30"
           style={{ width: '45%', maxWidth: '500px', minWidth: '350px' }}>
        {panel}
      </div>
      <div className="md:hidden fixed inset-0 bg-white z-50 flex flex-col">
        {panel}
      </div>
    </>
  );
}
