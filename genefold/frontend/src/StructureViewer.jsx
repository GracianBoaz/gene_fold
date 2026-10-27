import React, { useEffect, useRef, useState, useCallback } from 'react';

const StructureViewer = ({ structures, highlightVariant, onClearHighlight }) => {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [selectedStructIdx, setSelectedStructIdx] = useState(0);
  const [representation, setRepresentation] = useState('cartoon');
  const [colorScheme, setColorScheme] = useState('ss');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  useEffect(() => {
    return () => {
      if (viewerRef.current) {
        viewerRef.current.removeAllModels();
        viewerRef.current.clear();
        viewerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!window.$3Dmol) {
      setError("3Dmol.js library is not loaded.");
      return;
    }
    if (containerRef.current && !viewerRef.current) {
      viewerRef.current = window.$3Dmol.createViewer(containerRef.current, {
        backgroundColor: 'white'
      });
    }
  }, []);

  const applyStyle = useCallback(() => {
    if (!viewerRef.current) return;
    
    let style = {};
    if (representation === 'cartoon') {
      style = { cartoon: {} };
      if (colorScheme === 'plddt') {
         style.cartoon.colorfunc = (atom) => {
           const b = atom.b;
           if (b > 90) return '#0053d6'; // blue
           if (b > 70) return '#65cbef'; // light blue
           if (b > 50) return '#ffc21a'; // yellow
           return '#ff7d45'; // orange
         };
      } else if (colorScheme === 'chain') {
         style.cartoon.colorfunc = (atom) => {
            const colors = ['red', 'green', 'blue', 'yellow', 'purple', 'cyan', 'magenta', 'orange'];
            const c = atom.chain || 'A';
            return colors[c.charCodeAt(0) % colors.length];
         };
      } else if (colorScheme === 'spectrum') {
         style.cartoon.colorscheme = 'rainbow';
      }
    } else if (representation === 'sticks') {
      style = { stick: {} };
      if (colorScheme === 'plddt') {
         style.stick.colorfunc = (atom) => {
           const b = atom.b;
           if (b > 90) return '#0053d6'; 
           if (b > 70) return '#65cbef'; 
           if (b > 50) return '#ffc21a'; 
           return '#ff7d45'; 
         };
      } else if (colorScheme === 'spectrum') {
         style.stick.colorscheme = 'rainbow';
      }
    }

    viewerRef.current.setStyle({}, style);
    
    viewerRef.current.removeAllSurfaces();
    if (representation === 'surface') {
       viewerRef.current.addSurface(window.$3Dmol.SurfaceType.VDW, {
           opacity: 1, 
           colorfunc: colorScheme === 'plddt' ? (atom) => {
               const b = atom.b;
               if (b > 90) return '#0053d6'; 
               if (b > 70) return '#65cbef'; 
               if (b > 50) return '#ffc21a'; 
               return '#ff7d45'; 
           } : undefined,
           colorscheme: colorScheme === 'spectrum' ? 'rainbow' : undefined
       });
    }

    viewerRef.current.removeAllLabels();
    if (highlightVariant && highlightVariant.position) {
       const resiMatch = highlightVariant.position.toString().match(/\d+/);
       if (resiMatch) {
           const resi = parseInt(resiMatch[0], 10);
           viewerRef.current.setStyle({resi: resi}, {sphere: {color: 'red'}});
           const labelText = highlightVariant.diseaseName
             ? `${highlightVariant.change} (pos ${resi}) • ${highlightVariant.diseaseName}`
             : `${highlightVariant.change} (pos ${resi})`;
           viewerRef.current.addLabel(labelText, {
               fontSize: 13,
               fontColor: 'white',
               backgroundColor: '#dc2626',
               backgroundOpacity: 0.9,
               showBackground: true
           }, {resi: resi});
           
           viewerRef.current.zoomTo({resi: resi});
       }
    } else {
       viewerRef.current.zoomTo();
    }

    viewerRef.current.render();
  }, [representation, colorScheme, selectedStructIdx, structures, highlightVariant]);

  const loadModel = useCallback(async () => {
    if (!viewerRef.current || !structures || structures.length === 0) return;
    
    const struct = structures[selectedStructIdx];
    const proxyUrl = `${API_URL}/api/structure-file?url=${encodeURIComponent(struct.file_url)}`;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch structure: ${response.status} ${response.statusText}`);
      }
      const data = await response.text();
      
      viewerRef.current.clear();
      
      const format = struct.file_format || (struct.file_url.endsWith('.cif') ? 'cif' : 'pdb');
      viewerRef.current.addModel(data, format);
      
      applyStyle();
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError(err.message);
      setLoading(false);
      viewerRef.current.clear();
    }
  }, [selectedStructIdx, structures, API_URL, applyStyle]);

  useEffect(() => {
    loadModel();
  }, [selectedStructIdx, loadModel]); 

  useEffect(() => {
    applyStyle();
  }, [representation, colorScheme, highlightVariant, applyStyle]);

  const handleDownload = () => {
    const struct = structures[selectedStructIdx];
    const proxyUrl = `${API_URL}/api/structure-file?url=${encodeURIComponent(struct.file_url)}`;
    window.open(proxyUrl, '_blank');
  };

  if (!structures || structures.length === 0) {
    return <div className="text-center py-20 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">No structures available for this protein.</div>;
  }

  const selectedStruct = structures[selectedStructIdx];

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Controls */}
      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="flex flex-col flex-1 min-w-[200px]">
          <label className="text-sm font-semibold text-gray-700 mb-1">Select Structure</label>
          <select 
            value={selectedStructIdx} 
            onChange={(e) => {
               setSelectedStructIdx(Number(e.target.value));
               if (structures[Number(e.target.value)].source !== 'AlphaFold' && colorScheme === 'plddt') {
                  setColorScheme('ss');
               }
            }}
            className="border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500 w-full"
          >
            {structures.map((s, idx) => (
              <option key={idx} value={idx}>
                {s.struct_id} ({s.source}) - {s.resolution ? `${s.resolution}Å` : `pLDDT: ${s.plddt?.toFixed(1)}`}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-sm font-semibold text-gray-700 mb-1">Representation</label>
          <select 
            value={representation} 
            onChange={(e) => setRepresentation(e.target.value)}
            className="border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="cartoon">Cartoon</option>
            <option value="surface">Surface</option>
            <option value="sticks">Sticks</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-sm font-semibold text-gray-700 mb-1">Color Scheme</label>
          <select 
            value={colorScheme} 
            onChange={(e) => setColorScheme(e.target.value)}
            className="border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="ss">Default</option>
            <option value="spectrum">Spectrum</option>
            <option value="chain">By Chain</option>
            {selectedStruct.source === 'AlphaFold' && <option value="plddt">AlphaFold Confidence</option>}
          </select>
        </div>

        <div className="flex gap-2 ml-auto mt-2 sm:mt-0">
          {highlightVariant && (
             <button 
               onClick={() => {
                  if (onClearHighlight) onClearHighlight();
               }}
               className="bg-red-100 hover:bg-red-200 text-red-800 font-medium py-2 px-4 rounded-md shadow-sm transition flex items-center gap-1"
             >
               Clear Variant
             </button>
          )}
          <button 
            onClick={() => { viewerRef.current?.zoomTo(); viewerRef.current?.render(); }}
            className="bg-white hover:bg-gray-100 text-gray-800 font-medium py-2 px-4 border border-gray-300 rounded-md shadow-sm transition"
          >
            Reset View
          </button>
          <button 
            onClick={handleDownload}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md shadow-sm transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Download
          </button>
        </div>
      </div>
      
      {/* Viewer Container */}
      <div className="relative w-full h-[600px] border border-gray-300 rounded-xl overflow-hidden bg-white shadow-inner">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
            <svg className="animate-spin h-10 w-10 text-indigo-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-indigo-800 font-semibold text-lg">Loading 3D Structure...</p>
            <p className="text-gray-500 text-sm mt-1">Downloading from {selectedStruct.source}</p>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 p-6 text-center">
            <div className="bg-red-100 p-3 rounded-full text-red-500 mb-3">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-red-700 font-bold mb-2">Error loading structure</p>
            <p className="text-gray-600 text-sm max-w-md">{error}</p>
            <button onClick={loadModel} className="mt-4 px-6 py-2 bg-red-600 text-white font-medium rounded-lg shadow hover:bg-red-700 transition">Retry</button>
          </div>
        )}
        
        <div ref={containerRef} className="w-full h-full" style={{ position: 'relative' }} />
        
        {selectedStruct.source === 'AlphaFold' && !loading && !error && (
          <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur p-4 rounded-xl shadow-lg border border-blue-100 max-w-md pointer-events-none">
            <div className="flex items-start gap-3">
              <div className="text-blue-500 mt-0.5">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
              </div>
              <div>
                <p className="text-xs text-blue-900 font-semibold leading-relaxed">
                  AlphaFold models are computational predictions, not experimentally determined structures.
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Reliability varies across the sequence (select 'AlphaFold Confidence' color scheme to view pLDDT scores).
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StructureViewer;
