import { useState, useMemo } from 'react'
import StructureViewer from './StructureViewer'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function App() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  
  const [candidates, setCandidates] = useState([]);
  const [proteinData, setProteinData] = useState(null);
  const [structuresData, setStructuresData] = useState(null);
  
  const [activeTab, setActiveTab] = useState('Overview');
  const [highlightRegion, setHighlightRegion] = useState(null);
  const [highlightVariant, setHighlightVariant] = useState(null);

  // Disease search and filter state
  const [diseaseSearch, setDiseaseSearch] = useState('');
  const [diseaseFilter, setDiseaseFilter] = useState('all');
  const [expandedDiseases, setExpandedDiseases] = useState(new Set());

  const handleSearch = async (searchQuery) => {
    const q = searchQuery || query;
    if (!q) return;
    
    setQuery(q);
    setStatus('resolving');
    setErrorMsg('');
    setCandidates([]);
    setProteinData(null);
    setStructuresData(null);
    setActiveTab('Overview');
    setHighlightRegion(null);
    setHighlightVariant(null);
    setDiseaseSearch('');
    setDiseaseFilter('all');
    setExpandedDiseases(new Set());

    try {
      const resolveRes = await fetch(`${API_URL}/api/resolve?q=${encodeURIComponent(q)}`);
      if (!resolveRes.ok) {
        let msg = `Error ${resolveRes.status}`;
        try {
            const data = await resolveRes.json();
            msg = data.detail || msg;
        } catch {
            // ignore JSON parse error
        }
        throw new Error(msg);
      }
      const resolveData = await resolveRes.json();
      
      if (resolveData.candidates && resolveData.candidates.length > 0) {
        setCandidates(resolveData.candidates);
        setStatus('candidates');
      } else {
        await loadProteinAndStructures(resolveData.accession);
      }
    } catch (error) {
      console.error(error);
      setErrorMsg(error.message || 'Failed to resolve query');
      setStatus('error');
    }
  };

  const loadProteinAndStructures = async (accession) => {
    setStatus('loading');
    try {
      const [proteinRes, structRes] = await Promise.all([
        fetch(`${API_URL}/api/protein/${accession}`),
        fetch(`${API_URL}/api/structures/${accession}`)
      ]);
      
      if (!proteinRes.ok) throw new Error(`Protein Error: ${proteinRes.status}`);
      if (!structRes.ok) throw new Error(`Structures Error: ${structRes.status}`);
      
      const pData = await proteinRes.json();
      const sData = await structRes.json();
      
      setProteinData(pData);
      setStructuresData(sData);
      setStatus('success');
    } catch (error) {
      console.error(error);
      setErrorMsg(error.message || 'Failed to load protein data');
      setStatus('error');
    }
  };

  const handleChipClick = (chip) => {
    setQuery(chip);
    handleSearch(chip);
  };

  const handleDomainClick = (domain) => {
    setHighlightRegion({ start: domain.start, end: domain.end });
    setActiveTab('Sequence');
  };

  const handleShowDiseaseVariantOnStructure = (variant, diseaseName) => {
    setHighlightVariant({
      ...variant,
      diseaseName: diseaseName || variant.description
    });
    setActiveTab('Structure');
  };

  const handleShowDiseaseVariantOnSequence = (variant) => {
    setHighlightRegion({
      start: variant.position,
      end: variant.position
    });
    setActiveTab('Sequence');
  };

  const toggleExpandDisease = (idx) => {
    setExpandedDiseases(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  // Filtered diseases for dedicated tab
  const filteredDiseases = useMemo(() => {
    if (!proteinData?.diseases) return [];
    return proteinData.diseases.filter((d) => {
      // Text search
      if (diseaseSearch.trim()) {
        const q = diseaseSearch.toLowerCase();
        const nameMatch = d.name?.toLowerCase().includes(q);
        const acronymMatch = d.acronym?.toLowerCase().includes(q);
        const descMatch = d.description?.toLowerCase().includes(q);
        const noteMatch = d.note?.toLowerCase().includes(q);
        const mimMatch = d.mim_id?.toString().includes(q);
        const orphMatch = d.orphanet_id?.toString().includes(q);
        if (!nameMatch && !acronymMatch && !descMatch && !noteMatch && !mimMatch && !orphMatch) {
          return false;
        }
      }

      // Category filter
      if (diseaseFilter === 'causative') {
        return d.causality === 'Causative';
      } else if (diseaseFilter === 'dominant') {
        return d.inheritance?.toLowerCase().includes('dominant');
      } else if (diseaseFilter === 'recessive') {
        return d.inheritance?.toLowerCase().includes('recessive');
      } else if (diseaseFilter === 'susceptibility') {
        return d.causality === 'Genetic susceptibility' || d.inheritance?.toLowerCase().includes('susceptibility');
      } else if (diseaseFilter === 'orphanet') {
        return Boolean(d.orphanet_id);
      } else if (diseaseFilter === 'variants') {
        return d.variants && d.variants.length > 0;
      }

      return true;
    });
  }, [proteinData, diseaseSearch, diseaseFilter]);

  // Disease summary stats
  const diseaseStats = useMemo(() => {
    const list = proteinData?.diseases || [];
    const causative = list.filter(d => d.causality === 'Causative').length;
    const dominant = list.filter(d => d.inheritance?.toLowerCase().includes('dominant')).length;
    const recessive = list.filter(d => d.inheritance?.toLowerCase().includes('recessive')).length;
    const orphanet = list.filter(d => d.orphanet_id).length;
    const withVariants = list.filter(d => d.variants && d.variants.length > 0).length;
    const totalVariantsCount = list.reduce((acc, d) => acc + (d.variants_count || 0), 0);
    return {
      total: list.length,
      causative,
      dominant,
      recessive,
      orphanet,
      withVariants,
      totalVariantsCount
    };
  }, [proteinData]);

  const getCausalityBadge = (causality) => {
    switch (causality) {
      case 'Causative':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Genetic susceptibility':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Involved in pathogenesis':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getInheritanceBadge = (inheritance) => {
    if (!inheritance || inheritance === 'Not specified') {
      return 'bg-gray-100 text-gray-600 border-gray-200';
    }
    const inh = inheritance.toLowerCase();
    if (inh.includes('dominant')) {
      return 'bg-purple-50 text-purple-700 border-purple-200';
    } else if (inh.includes('recessive')) {
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    } else if (inh.includes('x-linked')) {
      return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    } else if (inh.includes('somatic') || inh.includes('sporadic')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    } else if (inh.includes('rare')) {
      return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200';
    }
    return 'bg-teal-50 text-teal-700 border-teal-200';
  };

  // FASTA rendering with blocks of 10
  const renderSequence = () => {
    if (!proteinData?.sequence?.fasta) return null;
    const seq = proteinData.sequence.fasta;
    let elements = [];
    
    const charsPerLine = 60;
    
    for (let i = 0; i < seq.length; i += charsPerLine) {
      const lineSeq = seq.slice(i, i + charsPerLine);
      const lineNumber = String(i + 1).padStart(4, ' ');
      
      let blocks = [];
      for (let j = 0; j < lineSeq.length; j += 10) {
        const block = lineSeq.slice(j, j + 10);
        
        let blockChars = [];
        for (let k = 0; k < block.length; k++) {
          const pos = i + j + k + 1;
          let isHighlighted = highlightRegion && pos >= highlightRegion.start && pos <= highlightRegion.end;
          blockChars.push(
            <span key={pos} className={isHighlighted ? "bg-yellow-300 text-black font-bold ring-2 ring-yellow-400 rounded-xs" : ""}>
              {block[k]}
            </span>
          );
        }
        
        blocks.push(
          <span key={j} className="mr-3 inline-block">
            {blockChars}
          </span>
        );
      }
      
      elements.push(
        <div key={i} className="flex">
          <span className="text-gray-400 select-none mr-4 w-10 text-right">{lineNumber}</span>
          <span className="font-mono tracking-widest">{blocks}</span>
        </div>
      );
    }
    return elements;
  };

  const copyFasta = () => {
    if (!proteinData) return;
    const fasta = `>${proteinData.accession} | ${proteinData.protein_name}\n${proteinData.sequence.fasta}`;
    navigator.clipboard.writeText(fasta);
    alert('Copied to clipboard');
  };

  const downloadFasta = () => {
    if (!proteinData) return;
    const fasta = `>${proteinData.accession} | ${proteinData.protein_name}\n${proteinData.sequence.fasta}`;
    const blob = new Blob([fasta], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proteinData.accession}.fasta`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="bg-white/90 backdrop-blur-md sticky top-0 z-40 shadow-xs border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <span className="text-xl font-extrabold text-slate-900 tracking-tight">Gene<span className="text-indigo-600">Fold</span></span>
              <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60">Genetics & Pathology</span>
            </div>
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-4">
            <span className="hidden sm:inline">UniProt • AlphaFold • RCSB PDB • OMIM • Orphanet</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Section */}
        <div className="max-w-3xl mx-auto mb-10 text-center">
          <h2 className="text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
            Explore Genes, Proteins & Diseases
          </h2>
          <p className="text-slate-600 mb-6 text-base max-w-xl mx-auto">
            Search any human gene, protein accession, or disorder to inspect 3D structures and pathological mutations.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex shadow-lg rounded-2xl relative overflow-hidden transition-all duration-300 hover:shadow-xl focus-within:ring-4 focus-within:ring-indigo-500/20 border border-slate-200 bg-white">
            <div className="relative flex-1 flex items-center">
              <svg className="w-5 h-5 ml-5 text-gray-400 absolute pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input 
                type="text"
                className="w-full border-0 pl-14 pr-4 py-4 text-gray-900 placeholder:text-gray-400 focus:outline-hidden text-base sm:text-lg"
                placeholder="Search Gene (TP53, BRCA1, INS, CFTR), UniProt (P04637), PDB..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center px-8 py-4 text-base font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors focus:outline-hidden cursor-pointer shadow-inner"
              disabled={status === 'resolving' || status === 'loading'}
            >
              {status === 'resolving' || status === 'loading' ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  Searching...
                </span>
              ) : 'Search'}
            </button>
          </form>
          <div className="mt-5 flex flex-wrap justify-center items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Suggested:</span>
            {[
              { label: 'TP53 (Li-Fraumeni)', q: 'TP53' },
              { label: 'BRCA1 (Breast/Ovarian)', q: 'BRCA1' },
              { label: 'INS (Neonatal Diabetes)', q: 'INS' },
              { label: 'HBB (Sickle Cell/Thal)', q: 'P68871' },
              { label: 'CFTR (Cystic Fibrosis)', q: 'P13569' }
            ].map((chip) => (
              <button 
                key={chip.q}
                type="button"
                onClick={() => handleChipClick(chip.q)}
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white text-indigo-700 hover:bg-indigo-50 border border-slate-200 transition-all shadow-2xs hover:border-indigo-300 cursor-pointer"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status & Results */}
        <div className="max-w-6xl mx-auto">
          {status === 'resolving' && (
            <div className="text-center p-12 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="text-slate-600 font-medium">Resolving identifier & cross-references...</p>
            </div>
          )}

          {status === 'loading' && (
            <div className="text-center p-12 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="text-slate-600 font-medium">Loading protein report, diseases, and 3D structures...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="bg-red-50 text-red-700 p-5 rounded-2xl border border-red-200 flex items-start gap-3 shadow-xs">
              <svg className="w-6 h-6 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <strong className="font-semibold block text-red-800">Error resolving query:</strong>
                <p className="text-sm mt-1">{errorMsg}</p>
              </div>
            </div>
          )}
          
          {status === 'candidates' && (
            <div className="bg-white shadow-md rounded-2xl p-6 border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Multiple Candidates Found</h3>
              <p className="text-sm text-slate-500 mb-4">Please select the specific accession you would like to explore:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {candidates.map(acc => (
                  <button 
                    key={acc}
                    onClick={() => loadProteinAndStructures(acc)}
                    className="p-3 text-left border border-slate-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50/50 transition-all font-mono text-sm text-indigo-700 font-bold flex items-center justify-between cursor-pointer"
                  >
                    <span>{acc}</span>
                    <span className="text-xs text-indigo-500 font-sans font-normal">View details →</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {status === 'success' && proteinData && (
            <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-slate-200">
              {/* Protein Banner */}
              <div className="px-6 py-6 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 bg-indigo-900/60 px-2.5 py-0.5 rounded-full border border-indigo-700/50">
                        {proteinData.gene || "Protein"}
                      </span>
                      {proteinData.organism && (
                        <span className="text-xs text-slate-300">Taxon ID: {proteinData.organism} (Human)</span>
                      )}
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                      {proteinData.protein_name || proteinData.gene || proteinData.accession}
                    </h3>
                  </div>

                  {/* Disease Badge in Header */}
                  {diseaseStats.total > 0 && (
                    <button
                      onClick={() => setActiveTab('Diseases')}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-200 hover:text-white transition-all cursor-pointer shadow-sm group shrink-0"
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse"></span>
                      <span className="text-sm font-semibold">{diseaseStats.total} Associated Diseases</span>
                      <span className="text-xs text-rose-300 group-hover:translate-x-1 transition-transform">→</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 text-xs mt-4">
                  <span className="bg-slate-800/80 px-3 py-1 rounded-lg border border-slate-700 text-slate-300">
                    UniProt: <b className="text-indigo-300 font-mono">{proteinData.accession}</b>
                  </span>
                  {proteinData.gene && (
                    <span className="bg-slate-800/80 px-3 py-1 rounded-lg border border-slate-700 text-slate-300">
                      Gene Symbol: <b className="text-indigo-300">{proteinData.gene}</b>
                    </span>
                  )}
                  {proteinData.sequence?.length && (
                    <span className="bg-slate-800/80 px-3 py-1 rounded-lg border border-slate-700 text-slate-300">
                      Length: <b className="text-indigo-300">{proteinData.sequence.length} residues</b>
                    </span>
                  )}
                  {structuresData?.structures?.length > 0 && (
                    <span className="bg-slate-800/80 px-3 py-1 rounded-lg border border-slate-700 text-slate-300">
                      3D Structures: <b className="text-emerald-400">{structuresData.structures.length} available</b>
                    </span>
                  )}
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="border-b border-slate-200 bg-slate-50/50">
                <nav className="-mb-px flex flex-wrap">
                  {[
                    { id: 'Overview', label: 'Overview', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
                    { 
                      id: 'Diseases', 
                      label: 'Diseases & Pathology', 
                      badge: diseaseStats.total,
                      badgeColor: 'bg-rose-100 text-rose-700 border-rose-200',
                      icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' 
                    },
                    { 
                      id: 'Sequence', 
                      label: 'Sequence', 
                      badge: proteinData.sequence?.length ? `${proteinData.sequence.length} aa` : null,
                      badgeColor: 'bg-slate-200 text-slate-700',
                      icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4' 
                    },
                    { 
                      id: 'Structure', 
                      label: '3D Structure', 
                      badge: structuresData?.structures?.length || 0,
                      badgeColor: 'bg-indigo-100 text-indigo-700 border-indigo-200',
                      icon: 'M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5' 
                    }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`${
                        activeTab === tab.id
                          ? 'border-indigo-600 text-indigo-700 bg-white shadow-2xs font-bold'
                          : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300 bg-transparent'
                      } flex-1 min-w-[140px] py-4 px-3 text-center border-b-2 font-medium text-sm transition-all flex items-center justify-center gap-2 cursor-pointer`}
                    >
                      <svg className={`w-4 h-4 ${activeTab === tab.id ? 'text-indigo-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon} />
                      </svg>
                      <span>{tab.label}</span>
                      {tab.badge !== null && tab.badge !== undefined && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${tab.badgeColor || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Tab Contents */}
              <div className="p-6 sm:p-8">
                {/* ===================== OVERVIEW TAB ===================== */}
                {activeTab === 'Overview' && (
                  <div className="space-y-8 animate-fade-in">
                    {/* Associated Diseases Highlight Section */}
                    <div className="bg-gradient-to-br from-rose-50/70 via-white to-slate-50 rounded-2xl p-6 border border-rose-100 shadow-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-rose-100 gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                            <h4 className="text-xl font-bold text-slate-900">
                              Associated Diseases & Pathologies
                            </h4>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Disorders, syndromes, and malignancies caused by or associated with mutations in {proteinData.gene || proteinData.accession}.
                          </p>
                        </div>
                        <button
                          onClick={() => setActiveTab('Diseases')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer self-start sm:self-auto"
                        >
                          <span>Explore All {diseaseStats.total} Diseases</span>
                          <span>→</span>
                        </button>
                      </div>

                      {/* Disease Stats Row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5">
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                          <span className="text-xs text-slate-500 font-medium block">Total Diseases</span>
                          <span className="text-2xl font-extrabold text-slate-900">{diseaseStats.total}</span>
                        </div>
                        <div className="bg-white p-3.5 rounded-xl border border-rose-200/80 shadow-2xs">
                          <span className="text-xs text-rose-600 font-medium block">Causative Gene In</span>
                          <span className="text-2xl font-extrabold text-rose-700">{diseaseStats.causative}</span>
                        </div>
                        <div className="bg-white p-3.5 rounded-xl border border-purple-200/80 shadow-2xs">
                          <span className="text-xs text-purple-600 font-medium block">Autosomal Dominant</span>
                          <span className="text-2xl font-extrabold text-purple-700">{diseaseStats.dominant}</span>
                        </div>
                        <div className="bg-white p-3.5 rounded-xl border border-indigo-200/80 shadow-2xs">
                          <span className="text-xs text-indigo-600 font-medium block">Rare Diseases (Orphanet)</span>
                          <span className="text-2xl font-extrabold text-indigo-700">{diseaseStats.orphanet}</span>
                        </div>
                      </div>

                      {/* Top 3 Featured Diseases Preview */}
                      {proteinData.diseases && proteinData.diseases.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                          {proteinData.diseases.slice(0, 3).map((dis, idx) => (
                            <div key={idx} className="bg-white rounded-xl p-4 border border-slate-200 hover:border-rose-300 transition-all shadow-2xs flex flex-col justify-between">
                              <div>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <h5 className="font-bold text-slate-900 text-sm leading-snug">
                                    {dis.name}
                                  </h5>
                                  {dis.acronym && (
                                    <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md shrink-0">
                                      {dis.acronym}
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1.5 mb-2.5">
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getCausalityBadge(dis.causality)}`}>
                                    {dis.causality}
                                  </span>
                                  {dis.inheritance && dis.inheritance !== 'Not specified' && (
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getInheritanceBadge(dis.inheritance)}`}>
                                      {dis.inheritance}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-600 line-clamp-3 mb-3">
                                  {dis.description || dis.note || "Pathology documented in UniProt and clinical databases."}
                                </p>
                              </div>

                              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[11px]">
                                  {dis.mim_id && <span className="bg-slate-50 px-1.5 py-0.5 rounded border">MIM:{dis.mim_id}</span>}
                                  {dis.orphanet_id && <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200">ORPHA:{dis.orphanet_id}</span>}
                                </div>
                                {dis.variants?.length > 0 ? (
                                  <button
                                    onClick={() => handleShowDiseaseVariantOnStructure(dis.variants[0], dis.name)}
                                    className="text-xs font-semibold text-rose-600 hover:text-rose-800 transition cursor-pointer"
                                  >
                                    View 3D ({dis.variants.length}) →
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setActiveTab('Diseases')}
                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                                  >
                                    Details →
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 italic mt-2">No specific diseases currently cataloged for this protein record.</p>
                      )}
                    </div>

                    {/* Biological Function */}
                    <div>
                      <h4 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        Biological Function
                      </h4>
                      {proteinData.function && proteinData.function.length > 0 ? (
                        <div className="bg-slate-50/70 rounded-xl p-5 text-sm text-slate-700 space-y-3 border border-slate-200 leading-relaxed">
                          {proteinData.function.map((f, i) => <p key={i}>{f}</p>)}
                        </div>
                      ) : <p className="text-slate-500 italic text-sm">No function data available.</p>}
                    </div>

                    {/* Biological Pathways */}
                    <div>
                      <h4 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Biological Pathways
                      </h4>
                      {proteinData.pathways && proteinData.pathways.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {proteinData.pathways.map((p, i) => (
                            <div key={i} className="bg-white p-3 rounded-lg border border-slate-200 text-xs text-slate-700 flex items-center gap-2 shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                              <span>{p}</span>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-slate-500 italic text-sm">No pathway data cataloged.</p>}
                    </div>

                    {/* Protein Domains */}
                    <div>
                      <h4 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        Functional Domains & Regions
                      </h4>
                      {proteinData.domains && proteinData.domains.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {proteinData.domains.map((d, i) => (
                            <div 
                              key={i} 
                              className="border border-slate-200 p-3.5 rounded-xl hover:border-indigo-400 hover:bg-indigo-50/20 cursor-pointer transition shadow-2xs bg-white group" 
                              onClick={() => handleDomainClick(d)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold text-sm text-slate-900 group-hover:text-indigo-700 transition-colors">
                                  {d.description || "Domain"}
                                </p>
                                <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                  {d.type}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-2 flex items-center justify-between">
                                <span>Positions: <b>{d.start} - {d.end}</b></span>
                                <span className="text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">Highlight sequence →</span>
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-slate-500 italic text-sm">No domains cataloged.</p>}
                    </div>

                    {/* Natural Variants with Associated Diseases Column */}
                    <div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                        <h4 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                          Natural Variants & Pathogenic Mutations
                          <span className="text-xs font-normal text-slate-500">({proteinData.variants?.length || 0} cataloged)</span>
                        </h4>
                        <span className="text-xs text-slate-500">
                          Click "Show on structure" to map pathogenic variants onto 3D coordinates.
                        </span>
                      </div>

                      {proteinData.variants && proteinData.variants.length > 0 ? (
                        <div className="overflow-x-auto shadow-xs rounded-xl border border-slate-200 bg-white">
                          <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50/80">
                              <tr>
                                <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Position</th>
                                <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Change</th>
                                <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Associated Disease / Pathology</th>
                                <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                                <th className="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">3D Action</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-100 text-sm">
                              {proteinData.variants.slice(0, 50).map((v, i) => (
                                <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="px-5 py-3 whitespace-nowrap font-mono font-medium text-slate-900">
                                    {v.position}
                                  </td>
                                  <td className="px-5 py-3 whitespace-nowrap">
                                    <span className="font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-xs">
                                      {v.change}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3">
                                    {v.associated_diseases && v.associated_diseases.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {v.associated_diseases.map((disName, dIdx) => (
                                          <span 
                                            key={dIdx} 
                                            className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200"
                                          >
                                            {disName}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-slate-400 italic">Unspecified pathology</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3 text-xs text-slate-600 max-w-md">
                                    {v.description}
                                  </td>
                                  <td className="px-5 py-3 whitespace-nowrap text-right">
                                    <button 
                                      onClick={() => {
                                        setHighlightVariant({
                                          ...v,
                                          diseaseName: v.associated_diseases?.[0] || v.description
                                        });
                                        setActiveTab('Structure');
                                      }}
                                      className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer shadow-2xs inline-flex items-center gap-1"
                                    >
                                      <span>Show on 3D</span>
                                      <span>→</span>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {proteinData.variants.length > 50 && (
                            <div className="p-3 bg-slate-50 text-center text-xs text-slate-500 border-t border-slate-200">
                              Showing first 50 of {proteinData.variants.length} cataloged variants.
                            </div>
                          )}
                        </div>
                      ) : <p className="text-slate-500 italic text-sm">No natural variants found.</p>}
                    </div>
                  </div>
                )}

                {/* ===================== DISEASES TAB ===================== */}
                {activeTab === 'Diseases' && (
                  <div className="space-y-6 animate-fade-in">
                    {/* Diseases Header Summary Banner */}
                    <div className="bg-gradient-to-r from-rose-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-md">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse"></span>
                            <span className="text-xs font-bold uppercase tracking-wider text-rose-300">
                              Clinical Pathology & Genetics
                            </span>
                          </div>
                          <h4 className="text-2xl font-extrabold text-white">
                            Diseases Occurred Due to {proteinData.gene || proteinData.protein_name || proteinData.accession}
                          </h4>
                          <p className="text-sm text-slate-300 mt-1 max-w-2xl">
                            Verified phenotypes, clinical disorders, and syndromes resulting from mutations, deficiencies, or dysfunction in this protein.
                          </p>
                        </div>
                        <div className="flex items-center gap-2 self-start md:self-auto">
                          <a 
                            href={`https://medlineplus.gov/genetics/gene/${proteinData.gene}/`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg border border-white/20 transition flex items-center gap-1"
                          >
                            <span>MedlinePlus Genetics</span>
                            <span className="text-[10px]">↗</span>
                          </a>
                          <a 
                            href={`https://www.malacards.org/search/results/${proteinData.gene}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg border border-white/20 transition flex items-center gap-1"
                          >
                            <span>MalaCards</span>
                            <span className="text-[10px]">↗</span>
                          </a>
                        </div>
                      </div>

                      {/* Stat Tiles */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                        <div className="bg-white/10 backdrop-blur-xs p-3.5 rounded-xl border border-white/10">
                          <span className="text-xs text-rose-200 block font-medium">Cataloged Diseases</span>
                          <span className="text-2xl font-black text-white">{diseaseStats.total}</span>
                        </div>
                        <div className="bg-white/10 backdrop-blur-xs p-3.5 rounded-xl border border-white/10">
                          <span className="text-xs text-rose-200 block font-medium">Causative Gene</span>
                          <span className="text-2xl font-black text-white">{diseaseStats.causative}</span>
                        </div>
                        <div className="bg-white/10 backdrop-blur-xs p-3.5 rounded-xl border border-white/10">
                          <span className="text-xs text-rose-200 block font-medium">Rare Diseases (Orphanet)</span>
                          <span className="text-2xl font-black text-white">{diseaseStats.orphanet}</span>
                        </div>
                        <div className="bg-white/10 backdrop-blur-xs p-3.5 rounded-xl border border-white/10">
                          <span className="text-xs text-rose-200 block font-medium">Diseases with 3D Mutations</span>
                          <span className="text-2xl font-black text-white">{diseaseStats.withVariants}</span>
                        </div>
                      </div>
                    </div>

                    {/* Filter & Search Bar */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                          <svg className="w-4 h-4 ml-3.5 text-slate-400 absolute top-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <input
                            type="text"
                            placeholder="Filter by disease name, acronym, OMIM ID, Orphanet ID, or symptoms..."
                            value={diseaseSearch}
                            onChange={(e) => setDiseaseSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                          {diseaseSearch && (
                            <button 
                              onClick={() => setDiseaseSearch('')}
                              className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Filter Chips */}
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100 text-xs">
                        <span className="text-slate-400 font-semibold self-center mr-1">Filter:</span>
                        {[
                          { id: 'all', label: `All (${diseaseStats.total})` },
                          { id: 'causative', label: `Causative (${diseaseStats.causative})` },
                          { id: 'dominant', label: `Autosomal Dominant (${diseaseStats.dominant})` },
                          { id: 'recessive', label: `Autosomal Recessive (${diseaseStats.recessive})` },
                          { id: 'orphanet', label: `Rare Diseases (${diseaseStats.orphanet})` },
                          { id: 'variants', label: `With 3D Mapped Mutations (${diseaseStats.withVariants})` }
                        ].map((btn) => (
                          <button
                            key={btn.id}
                            onClick={() => setDiseaseFilter(btn.id)}
                            className={`px-3 py-1 rounded-full font-medium transition cursor-pointer border ${
                              diseaseFilter === btn.id
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                            }`}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Diseases Cards List */}
                    {filteredDiseases.length > 0 ? (
                      <div className="space-y-4">
                        {filteredDiseases.map((d, index) => {
                          const isExpanded = expandedDiseases.has(index);
                          return (
                            <div 
                              key={index} 
                              className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 shadow-xs hover:shadow-md transition-all overflow-hidden"
                            >
                              {/* Disease Card Header */}
                              <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-50/70 via-white to-white border-b border-slate-100">
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                      <h5 className="text-lg font-bold text-slate-900 tracking-tight">
                                        {d.name}
                                      </h5>
                                      {d.acronym && (
                                        <span className="font-mono text-xs font-extrabold bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-md border border-slate-200">
                                          {d.acronym}
                                        </span>
                                      )}
                                      {d.disease_accession && (
                                        <a
                                          href={`https://www.uniprot.org/diseases/${d.disease_accession}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[11px] font-mono text-indigo-600 hover:underline bg-indigo-50/60 px-2 py-0.5 rounded border border-indigo-100"
                                        >
                                          {d.disease_accession} ↗
                                        </a>
                                      )}
                                    </div>

                                    {/* Badges */}
                                    <div className="flex flex-wrap gap-2 mt-2">
                                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${getCausalityBadge(d.causality)}`}>
                                        {d.causality}
                                      </span>
                                      {d.inheritance && d.inheritance !== 'Not specified' && (
                                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${getInheritanceBadge(d.inheritance)}`}>
                                          {d.inheritance}
                                        </span>
                                      )}
                                      {d.orphanet_id && (
                                        <a
                                          href={`https://www.orpha.net/consor/cgi-bin/OC_Exp.php?Lng=EN&Expert=${d.orphanet_id}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 hover:bg-fuchsia-100 transition"
                                        >
                                          Orphanet: ORPHA:{d.orphanet_id} ↗
                                        </a>
                                      )}
                                      {d.mim_id && (
                                        <a
                                          href={`https://www.omim.org/entry/${d.mim_id}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition font-mono"
                                        >
                                          OMIM: {d.mim_id} ↗
                                        </a>
                                      )}
                                    </div>
                                  </div>

                                  {/* Right side stats */}
                                  <div className="text-right shrink-0">
                                    {d.variants_count > 0 && (
                                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
                                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                        {d.variants_count} 3D Mutations
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Card Body */}
                              <div className="p-5 sm:p-6 space-y-4">
                                {/* Pathogenesis Mechanism Note */}
                                {d.note && (
                                  <div className="bg-rose-50/50 rounded-xl p-3.5 border border-rose-200/60 flex items-start gap-3">
                                    <div className="w-5 h-5 rounded-full bg-rose-200 text-rose-700 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">
                                      !
                                    </div>
                                    <div>
                                      <span className="text-xs font-bold uppercase tracking-wider text-rose-800 block mb-0.5">
                                        Pathogenic Mechanism / Involvement:
                                      </span>
                                      <p className="text-xs text-rose-900 leading-relaxed font-medium">
                                        {d.note}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Medical Description */}
                                <div>
                                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
                                    Clinical Phenotype & Pathology:
                                  </span>
                                  <p className="text-sm text-slate-700 leading-relaxed">
                                    {d.description ? (
                                      isExpanded || d.description.length <= 280
                                        ? d.description
                                        : `${d.description.slice(0, 280)}...`
                                    ) : (
                                      <span className="text-slate-400 italic">No detailed clinical description provided.</span>
                                    )}
                                  </p>
                                  {d.description && d.description.length > 280 && (
                                    <button
                                      onClick={() => toggleExpandDisease(index)}
                                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold mt-1 cursor-pointer"
                                    >
                                      {isExpanded ? 'Show less' : 'Read full description →'}
                                    </button>
                                  )}
                                </div>

                                {/* Associated Specific Mutations / Variants */}
                                {d.variants && d.variants.length > 0 && (
                                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                        Associated Mutations in this Protein ({d.variants.length}):
                                      </span>
                                      <span className="text-[11px] text-slate-500">
                                        Click mutation to locate on 3D structure
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {d.variants.slice(0, isExpanded ? d.variants.length : 12).map((v, vIdx) => (
                                        <div
                                          key={vIdx}
                                          className="inline-flex items-center bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-rose-400 transition overflow-hidden text-xs"
                                        >
                                          <button
                                            onClick={() => handleShowDiseaseVariantOnStructure(v, d.name)}
                                            className="px-2.5 py-1 text-slate-800 font-mono hover:bg-rose-50 hover:text-rose-700 transition cursor-pointer flex items-center gap-1.5"
                                            title={`Show mutation ${v.change} at position ${v.position} on 3D structure`}
                                          >
                                            <span className="font-bold text-rose-700">{v.change}</span>
                                            <span className="text-slate-400 text-[10px]">(pos {v.position})</span>
                                            <span className="text-rose-500 text-[11px] font-sans">3D ↗</span>
                                          </button>
                                          <button
                                            onClick={() => handleShowDiseaseVariantOnSequence(v)}
                                            className="px-1.5 py-1 border-l border-slate-100 text-[10px] text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition cursor-pointer"
                                            title="Highlight in FASTA sequence"
                                          >
                                            Seq
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                    {d.variants.length > 12 && (
                                      <button
                                        onClick={() => toggleExpandDisease(index)}
                                        className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold mt-2.5 cursor-pointer block"
                                      >
                                        {isExpanded ? 'Show fewer variants' : `View all ${d.variants.length} mapped mutations →`}
                                      </button>
                                    )}
                                  </div>
                                )}

                                {/* External Database Cross-References and Literature */}
                                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-slate-400 font-medium text-[11px]">Database References:</span>
                                    {d.mim_id && (
                                      <a
                                        href={`https://www.omim.org/entry/${d.mim_id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded font-mono transition"
                                      >
                                        OMIM #{d.mim_id} ↗
                                      </a>
                                    )}
                                    {d.orphanet_id && (
                                      <a
                                        href={`https://www.orpha.net/consor/cgi-bin/OC_Exp.php?Lng=EN&Expert=${d.orphanet_id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded font-mono transition"
                                      >
                                        ORPHA:{d.orphanet_id} ↗
                                      </a>
                                    )}
                                    <a
                                      href={`https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(proteinData.gene || d.name)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-slate-600 bg-slate-50 hover:bg-slate-100 px-2 py-0.5 rounded transition"
                                    >
                                      ClinVar ↗
                                    </a>
                                  </div>

                                  {/* PubMed Citations */}
                                  {d.pubmed_ids && d.pubmed_ids.length > 0 && (
                                    <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                                      <span className="font-medium">PubMed Evidence:</span>
                                      {d.pubmed_ids.slice(0, 4).map((pmid, pIdx) => (
                                        <a
                                          key={pIdx}
                                          href={`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-indigo-600 hover:underline font-mono bg-indigo-50/60 px-1.5 py-0.5 rounded"
                                        >
                                          {pmid}
                                        </a>
                                      ))}
                                      {d.pubmed_ids.length > 4 && (
                                        <span className="text-slate-400">+{d.pubmed_ids.length - 4} more</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
                        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <h5 className="text-lg font-bold text-slate-900 mb-1">No diseases match your search criteria</h5>
                        <p className="text-sm text-slate-500 mb-4">Try clearing filters or search terms.</p>
                        <button
                          onClick={() => { setDiseaseSearch(''); setDiseaseFilter('all'); }}
                          className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition"
                        >
                          Reset Filters
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* ===================== SEQUENCE TAB ===================== */}
                {activeTab === 'Sequence' && (
                  <div className="animate-fade-in space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
                      <div>
                        <h4 className="text-lg font-bold text-slate-900">
                          Amino Acid Sequence
                        </h4>
                        <p className="text-xs text-slate-500">
                          {proteinData.sequence?.length} residues • Standard FASTA format
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {highlightRegion && (
                          <button 
                            onClick={() => setHighlightRegion(null)} 
                            className="px-3 py-1.5 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 shadow-2xs"
                          >
                            <span>Clear Residue Highlight</span>
                            <span>✕</span>
                          </button>
                        )}
                        <button 
                          onClick={copyFasta} 
                          className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition cursor-pointer shadow-2xs"
                        >
                          Copy FASTA
                        </button>
                        <button 
                          onClick={downloadFasta} 
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer shadow-2xs"
                        >
                          Download FASTA
                        </button>
                      </div>
                    </div>

                    {highlightRegion && (
                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-800 flex items-center justify-between">
                        <span>
                          Currently highlighting residues: <b>{highlightRegion.start}</b> to <b>{highlightRegion.end}</b>
                        </span>
                        <button onClick={() => setHighlightRegion(null)} className="underline hover:text-yellow-900">
                          Reset
                        </button>
                      </div>
                    )}

                    <div className="bg-slate-900 text-slate-100 p-6 rounded-2xl overflow-x-auto shadow-inner border border-slate-800 text-xs sm:text-sm font-mono leading-relaxed">
                      {renderSequence()}
                    </div>
                  </div>
                )}

                {/* ===================== STRUCTURE TAB ===================== */}
                {activeTab === 'Structure' && (
                  <div className="animate-fade-in space-y-4">
                    {/* Highlighted Mutation Banner */}
                    {highlightVariant && (
                      <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                        <div className="flex items-center gap-3">
                          <span className="w-3 h-3 rounded-full bg-rose-600 animate-pulse shrink-0"></span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                                Highlighted Pathogenic Mutation:
                              </span>
                              <span className="font-mono font-bold text-rose-900 bg-rose-100 px-2 py-0.5 rounded text-xs">
                                {highlightVariant.change} (pos {highlightVariant.position})
                              </span>
                            </div>
                            {highlightVariant.diseaseName && (
                              <p className="text-xs text-rose-700 mt-0.5 font-medium">
                                Disease: <b>{highlightVariant.diseaseName}</b>
                              </p>
                            )}
                          </div>
                        </div>
                        <button 
                          onClick={() => setHighlightVariant(null)} 
                          className="text-xs bg-white text-rose-700 border border-rose-300 hover:bg-rose-100 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer self-start sm:self-auto shrink-0 shadow-2xs"
                        >
                          Clear Mutation Highlight ✕
                        </button>
                      </div>
                    )}

                    <StructureViewer 
                      structures={structuresData?.structures} 
                      highlightVariant={highlightVariant}
                      onClearHighlight={() => setHighlightVariant(null)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
