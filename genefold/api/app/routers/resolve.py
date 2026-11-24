from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from sqlalchemy.orm import Session
from ..services.classifier import classify
from ..services.uniprot import fetch_uniprot_search, fetch_uniprot_accession, fetch_id_mapping, fetch_rcsb_uniprot
from ..database import get_db
from ..models.protein import Protein, IdMap

router = APIRouter()

@router.get("/api/resolve")
async def resolve_gene(q: str, organism: str = "9606", db: Session = Depends(get_db)):
    if not q:
        raise HTTPException(status_code=400, detail="Query parameter 'q' is required")

    q_type = classify(q)
    accession = None
    candidates = []

    if q_type == "gene_symbol":
        data = await fetch_uniprot_search(q, organism)
        results = data.get("results", [])
        if not results:
            raise HTTPException(status_code=404, detail=f"No UniProt records found for gene {q}")
        if len(results) == 1:
            accession = results[0]["primaryAccession"]
        else:
            accession = results[0]["primaryAccession"]
            candidates = [r["primaryAccession"] for r in results]
            
    elif q_type in ("ncbi_gene_id", "refseq_protein"):
        from_db = "GeneID" if q_type == "ncbi_gene_id" else "RefSeq_Protein"
        mapped = await fetch_id_mapping(from_db, "UniProtKB", q)
        if not mapped:
            raise HTTPException(status_code=404, detail=f"No UniProt mapping found for {q}")
        accession = mapped[0]
        if len(mapped) > 1:
            candidates = mapped
            
    elif q_type == "uniprot_accession":
        data = await fetch_uniprot_accession(q.upper())
        if not data:
            raise HTTPException(status_code=404, detail=f"UniProt accession {q} not found")
        accession = data["primaryAccession"]
        
    elif q_type == "pdb_id":
        accession = await fetch_rcsb_uniprot(q)
        if not accession:
            raise HTTPException(status_code=404, detail=f"No UniProt accession found for PDB {q}")
            
    if not accession:
        raise HTTPException(status_code=404, detail="Could not resolve query to a UniProt accession")

    # Fetch the full accession info to get gene and protein names
    protein_data = await fetch_uniprot_accession(accession)
    if not protein_data:
        raise HTTPException(status_code=404, detail=f"UniProt accession {accession} details not found")
        
    gene_name = ""
    try:
        gene_name = protein_data.get("genes", [])[0].get("geneName", {}).get("value", "")
    except IndexError:
        pass
        
    protein_name = ""
    try:
        protein_name = protein_data.get("proteinDescription", {}).get("recommendedName", {}).get("fullName", {}).get("value", "")
    except AttributeError:
        pass
        
    organism_id = protein_data.get("organism", {}).get("taxonId", int(organism))

    # Save to ID Map
    prot_record = db.query(Protein).filter(Protein.accession == accession).first()
    if not prot_record:
        prot_record = Protein(
            accession=accession,
            gene_symbol=gene_name,
            protein_name=protein_name,
            taxon_id=organism_id,
            report_json=protein_data
        )
        db.add(prot_record)
        db.commit()

    map_record = db.query(IdMap).filter(
        IdMap.id_value == q,
        IdMap.id_type == q_type,
        IdMap.taxon_id == organism_id
    ).first()
    
    if not map_record:
        map_record = IdMap(
            id_value=q,
            id_type=q_type,
            taxon_id=organism_id,
            accession=accession
        )
        db.add(map_record)
        db.commit()

    return {
        "accession": accession,
        "gene": gene_name,
        "protein_name": protein_name,
        "organism": organism_id,
        "candidates": candidates
    }
