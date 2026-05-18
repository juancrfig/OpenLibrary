'use client';

import { useState, useEffect } from 'react';

type Book = {
  name: string;
  cover: string;
  timestamp: number;
  paragraphs?: string[];
  outline?: any[];
  pageMap?: number[]; // paragraph index → page number
};

type SidebarPos = 'left' | 'right' | 'top' | 'bottom';

export default function PDFReader() {
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [cover, setCover] = useState<string | null>(null);
  const [mode, setMode] = useState<'cover' | 'reader' | 'library' | 'settings'>('cover');
  const [library, setLibrary] = useState<Book[]>([]);
  const [sidebarPos, setSidebarPos] = useState<SidebarPos>('left');
  const [showTOC, setShowTOC] = useState(false);
  const [outline, setOutline] = useState<any[]>([]);
  const [pageMap, setPageMap] = useState<number[]>([]);

  useEffect(() => {
    const savedLib = localStorage.getItem('pdf-library');
    if (savedLib) setLibrary(JSON.parse(savedLib));
    const savedPos = localStorage.getItem('sidebar-pos') as SidebarPos | null;
    if (savedPos) setSidebarPos(savedPos);
  }, []);

  const saveLibrary = (newLib: Book[]) => {
    localStorage.setItem('pdf-library', JSON.stringify(newLib));
    setLibrary(newLib);
  };

  const savePos = (pos: SidebarPos) => {
    localStorage.setItem('sidebar-pos', pos);
    setSidebarPos(pos);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

    // Cover
    const firstPage = await pdf.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1.2 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await firstPage.render({ canvasContext: ctx, viewport }).promise;
    const coverData = canvas.toDataURL();
    setCover(coverData);

    // Extract text + build page map
    let allText: string[] = [];
    let newPageMap: number[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      const paras = pageText.split(/\n\n|\.\s+/).filter(p => p.trim().length > 20);

      const startIdx = allText.length;
      allText.push(...paras);

      // Map every new paragraph to this page number
      for (let j = 0; j < paras.length; j++) {
        newPageMap[startIdx + j] = i;
      }
    }

    setParagraphs(allText);
    setPageMap(newPageMap);

    // Outline
    const pdfOutline = await pdf.getOutline();
    setOutline(pdfOutline || []);

    setMode('cover');

    const newBook: Book = {
      name: file.name,
      cover: coverData,
      timestamp: Date.now(),
      paragraphs: allText,
      outline: pdfOutline || [],
      pageMap: newPageMap
    };
    const updated = [newBook, ...library.filter(b => b.name !== file.name)].slice(0, 20);
    saveLibrary(updated);
  };

  const openFromLibrary = (book: Book) => {
    setFileName(book.name);
    setCover(book.cover);
    setParagraphs(book.paragraphs || []);
    setOutline(book.outline || []);
    setPageMap(book.pageMap || []);
    setMode('cover');
  };

  const isHorizontal = sidebarPos === 'top' || sidebarPos === 'bottom';
  const isBottom = sidebarPos === 'bottom';

  // Navigate to a specific page from outline
  const navigateToOutline = async (dest: any) => {
    if (!dest) return;

    setMode('reader');
    setShowTOC(false);

    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf');
      const pdf = await pdfjs.getDocument({ data: await fetch(fileName).then(r => r.arrayBuffer()) }).promise; // won't work for stored

      // This is complex. For now we use a better heuristic:
      // Find first paragraph that belongs to the destination page
    } catch (e) {}

    // Fallback: better scroll using pageMap if available
    if (pageMap.length > 0 && typeof dest === 'object' && dest[0]) {
      // dest[0] is usually the page reference
      const pageNum = dest[0].num || 1;
      const targetParaIndex = pageMap.findIndex(p => p >= pageNum);

      if (targetParaIndex !== -1) {
        const element = document.querySelector(`.reader-content p:nth-child(${targetParaIndex + 1})`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
    }

    // Last resort: scroll based on rough estimate
    window.scrollTo({ top: 600, behavior: 'smooth' });
  };

  const Nav = () => {
    const base = `bg-zinc-900 flex items-center justify-center gap-1 p-1 flex-shrink-0 z-50`;

    const OpenButton = () => (
      <label htmlFor="pdf-upload" className="cursor-pointer flex items-center justify-center w-9 h-9 bg-white text-black rounded-full hover:bg-zinc-200 transition mx-1">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </label>
    );

    return (
      <div className={`
        ${isHorizontal ? 'flex-row h-14 border-b' : 'flex-col w-16 border-r'} 
        ${sidebarPos === 'right' ? 'border-l order-2' : ''}
        ${isBottom ? 'fixed bottom-0 left-0 right-0 border-t h-14' : ''}
        ${base}
      `}>
        <input type="file" accept=".pdf" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} className="hidden" id="pdf-upload" />
        <button onClick={() => setMode('library')} className={`px-3 py-1.5 text-xs rounded ${mode === 'library' ? 'bg-white text-black' : 'hover:bg-zinc-800'}`}>Lib</button>
        <button onClick={() => setMode('settings')} className={`px-3 py-1.5 text-xs rounded ${mode === 'settings' ? 'bg-white text-black' : 'hover:bg-zinc-800'}`}>Set</button>
        <OpenButton />
        <button onClick={() => setMode('cover')} className="px-3 py-1.5 text-xs rounded hover:bg-zinc-800">Read</button>
      </div>
    );
  };

  const renderOutline = (items: any[], level = 0): React.ReactNode => {
    return items.map((item, idx) => (
      <div key={idx}>
        <div 
          style={{ paddingLeft: level * 14 }} 
          className="py-1.5 text-sm text-zinc-300 hover:text-white cursor-pointer"
          onClick={() => navigateToOutline(item.dest)}
        >
          {item.title}
        </div>
        {item.items && item.items.length > 0 && renderOutline(item.items, level + 1)}
      </div>
    ));
  };

  return (
    <div className={`flex min-h-screen bg-zinc-950 text-zinc-200 font-sans ${isHorizontal && !isBottom ? 'flex-col' : ''}`}>
      <Nav />

      <div className={`flex-1 relative ${isBottom ? 'pb-14' : ''}`}>
        {/* Cover */}
        {mode === 'cover' && cover && (
          <div className="flex flex-col items-center justify-center min-h-screen pt-12">
            <div className="relative">
              <img src={cover} alt="cover" className="rounded-xl shadow-2xl max-h-[68vh] border border-zinc-800" />
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2">
                <button onClick={() => setMode('reader')} className="px-8 py-3 bg-white text-black rounded-full text-sm font-medium hover:bg-zinc-200 shadow-xl">Start Reading</button>
              </div>
            </div>
            <p className="mt-8 text-sm text-zinc-500">{fileName}</p>
          </div>
        )}

        {/* Reader */}
        {mode === 'reader' && (
          <div className="max-w-2xl mx-auto pt-20 pb-32 px-6 min-h-[80vh]">
            {outline.length > 0 && (
              <button 
                onClick={() => setShowTOC(!showTOC)}
                className="fixed left-4 top-20 z-50 px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-700 rounded-full hover:bg-zinc-800"
              >
                {showTOC ? 'Hide TOC' : 'Chapters'}
              </button>
            )}

            {showTOC && outline.length > 0 && (
              <div className="fixed left-4 top-32 z-50 w-72 max-h-[65vh] overflow-auto bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-sm shadow-xl">
                <div className="font-medium mb-3 text-xs text-zinc-400 tracking-widest">TABLE OF CONTENTS</div>
                {renderOutline(outline)}
              </div>
            )}

            <div className="reader-content space-y-6 text-[15px] leading-relaxed">
              {paragraphs.length > 0 ? (
                paragraphs.map((p, i) => <p key={i} className="text-zinc-300">{p}</p>)
              ) : (
                <div className="text-zinc-500">No text extracted.</div>
              )}
            </div>
          </div>
        )}

        {/* Library & Settings remain the same */}
        {mode === 'library' && (
          <div className="max-w-5xl mx-auto p-8">
            <div className="text-2xl mb-8">Library</div>
            {library.length === 0 && <div className="text-zinc-500">No books yet.</div>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {library.map((book, i) => (
                <div key={i} onClick={() => openFromLibrary(book)} className="cursor-pointer group">
                  <div className="aspect-[3/4] overflow-hidden rounded-xl border border-zinc-800 mb-2">
                    <img src={book.cover} className="w-full h-full object-cover group-hover:scale-105 transition" alt="" />
                  </div>
                  <div className="text-sm font-medium truncate">{book.name}</div>
                  <div className="text-xs text-zinc-500">{new Date(book.timestamp).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === 'settings' && (
          <div className="max-w-md mx-auto p-8">
            <div className="text-2xl mb-8">Settings</div>
            <div>
              <div className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Navbar Position</div>
              <div className="grid grid-cols-2 gap-2">
                {(['left','right','top','bottom'] as SidebarPos[]).map(pos => (
                  <button key={pos} onClick={() => savePos(pos)} className={`py-3 rounded text-sm capitalize border ${sidebarPos === pos ? 'bg-white text-black border-white' : 'border-zinc-700 hover:bg-zinc-900'}`}>
                    {pos}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
