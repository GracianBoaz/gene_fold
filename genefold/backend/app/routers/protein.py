from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from ..database import get_db
from ..models.protein import Protein
from ..services.uniprot import fetch_uniprot_accession
from ..services.cache import is_protein_stale

router = APIRouter()

def detect_inheritance(text_to_check: str) -> str:
    t = text_to_check.lower()
    if "autosomal dominant" in t:
        return "Autosomal dominant"
    elif "autosomal recessive" in t:
        return "Autosomal recessive"
    elif "x-linked dominant" in t:
        return "X-linked dominant"
    elif "x-linked recessive" in t or "x-linked" in t:
        return "X-linked"
    elif "mitochondrial" in t:
        return "Mitochondrial"
    elif "somatic" in t or "sporadic" in t:
        return "Somatic / Sporadic"
    elif "susceptibility" in t or "multifactorial" in t or "predisposition" in t:
        return "Genetic susceptibility"
    return "Not specified"

def detect_causality(note: str, desc: str) -> str:
    combined = f"{note} {desc}".lower()
    if "is caused by variants" in combined or "causes" in combined or "caused by mutations" in combined or "defects in" in combined:
        return "Causative"
    elif "susceptibility" in combined or "predisposes" in combined or "risk" in combined or "predisposition" in combined:
        return "Genetic susceptibility"
    elif "involved in" in combined or "pathogenesis" in combined:
        return "Involved in pathogenesis"
    return "Associated"

def parse_uniprot_report(data: dict) -> dict:
    accession = data.get("primaryAccession")
    
    gene = ""
    genes = data.get("genes", [])
    if genes:
        gene = genes[0].get("geneName", {}).get("value", "")
        
    organism = data.get("organism", {}).get("taxonId")
    
    protein_name = ""
    try:
        protein_name = data.get("proteinDescription", {}).get("recommendedName", {}).get("fullName", {}).get("value", "")
    except AttributeError:
        pass
        
    comments = data.get("comments", [])
    functions = []
    pathways = []
    diseases = []
    seen_disease_names = set()

    # Pre-extract natural variants
    features = data.get("features", [])
    domains = []
    variants = []
    for f in features:
        f_type = f.get("type")
        start = f.get("location", {}).get("start", {}).get("value")
        end = f.get("location", {}).get("end", {}).get("value")
        desc = (f.get("description") or "").strip()
        f_id = f.get("featureId")
        if f_type in ("Domain", "Region", "Repeat", "Motif", "Zinc finger", "Peptide", "Propeptide", "Signal"):
            label = desc if desc else (f"{f_type} peptide" if f_type == "Signal" else f_type)
            domains.append({"start": start, "end": end, "description": label, "type": f_type})
        elif f_type == "Natural variant":
            alt_seqs = f.get("alternativeSequence", {})
            orig = alt_seqs.get("originalSequence", "")
            alts = alt_seqs.get("alternativeSequences", [])
            change = f"{orig}->{alts[0] if alts else ''}"
            
            xrefs_var = []
            for xref in f.get("featureCrossReferences", []):
                xrefs_var.append({"database": xref.get("database"), "id": xref.get("id")})
                
            variants.append({
                "position": start,
                "change": change,
                "description": desc,
                "feature_id": f_id,
                "cross_references": xrefs_var,
                "associated_diseases": []
            })

    for c in comments:
        c_type = c.get("commentType")
        texts = c.get("texts", [])
        val = texts[0].get("value", "") if texts else ""
        if c_type == "FUNCTION" and val:
            functions.append(val)
        elif c_type == "PATHWAY" and val:
            if val not in pathways:
                pathways.append(val)
        elif c_type == "DISEASE":
            dis = c.get("disease")
            note_texts = c.get("note", {}).get("texts", [])
            note = note_texts[0].get("value", "") if note_texts else ""
            if dis:
                d_name = dis.get("diseaseId")
                if d_name and d_name not in seen_disease_names:
                    seen_disease_names.add(d_name)
                    acronym = dis.get("acronym")
                    description = dis.get("description", "")
                    d_accession = dis.get("diseaseAccession")
                    mim_id = None
                    disease_xref = dis.get("diseaseCrossReference")
                    if disease_xref and disease_xref.get("database") == "MIM":
                        mim_id = disease_xref.get("id")
                    
                    pubmed_ids = [
                        ev.get("id") for ev in dis.get("evidences", [])
                        if ev.get("source") == "PubMed" and ev.get("id")
                    ]
                    
                    # Match associated variants
                    assoc_variants = []
                    for v in variants:
                        vd = v["description"]
                        matched = False
                        if acronym and (
                            f"in {acronym};" in vd
                            or f"in {acronym} " in vd
                            or f"in {acronym}," in vd
                            or vd.startswith(f"in {acronym}")
                        ):
                            matched = True
                        elif d_name.lower() in vd.lower():
                            matched = True
                            
                        if matched:
                            assoc_variants.append({
                                "position": v["position"],
                                "change": v["change"],
                                "description": v["description"],
                                "feature_id": v.get("feature_id")
                            })
                            label = f"{d_name} ({acronym})" if acronym else d_name
                            if label not in v["associated_diseases"]:
                                v["associated_diseases"].append(label)
                    
                    inheritance = detect_inheritance(f"{description} {note}")
                    causality = detect_causality(note, description)

                    diseases.append({
                        "name": d_name,
                        "acronym": acronym,
                        "disease_accession": d_accession,
                        "description": description,
                        "mim_id": mim_id,
                        "orphanet_id": None,
                        "note": note,
                        "pubmed_ids": pubmed_ids,
                        "inheritance": inheritance,
                        "causality": causality,
                        "variants": assoc_variants,
                        "variants_count": len(assoc_variants)
                    })
            elif note:
                d_name = "Associated Pathologies / Disorders"
                if d_name not in seen_disease_names:
                    seen_disease_names.add(d_name)
                    diseases.append({
                        "name": d_name,
                        "acronym": None,
                        "disease_accession": None,
                        "description": note,
                        "mim_id": None,
                        "orphanet_id": None,
                        "note": "",
                        "pubmed_ids": [],
                        "inheritance": detect_inheritance(note),
                        "causality": detect_causality(note, ""),
                        "variants": [],
                        "variants_count": 0
                    })

    # Orphanet, MIM, and other Cross References
    xrefs = data.get("uniProtKBCrossReferences", [])
    cross_refs = {
        "ncbi_gene": [],
        "refseq": [],
        "ensembl": [],
        "pdb": [],
        "mim": [],
        "orphanet": [],
        "disgenet": [],
        "opentargets": []
    }
    
    for x in xrefs:
        db = x.get("database")
        xid = x.get("id")
        if db == "GeneID":
            cross_refs["ncbi_gene"].append(xid)
        elif db == "RefSeq":
            cross_refs["refseq"].append(xid)
        elif db == "Ensembl":
            cross_refs["ensembl"].append(xid)
        elif db == "PDB":
            cross_refs["pdb"].append(xid)
        elif db == "MIM":
            cross_refs["mim"].append(xid)
        elif db == "DisGeNET":
            cross_refs["disgenet"].append(xid)
        elif db == "OpenTargets":
            cross_refs["opentargets"].append(xid)
        elif db == "Orphanet":
            cross_refs["orphanet"].append(xid)
            orph_id = xid
            orph_name = ""
            for prop in x.get("properties", []):
                if prop.get("key") == "Disease":
                    orph_name = prop.get("value")
                    break
            if orph_name:
                matched_existing = False
                for d in diseases:
                    d_name_l = d["name"].lower()
                    d_acr_l = (d.get("acronym") or "").lower()
                    orph_l = orph_name.lower()
                    if (
                        orph_l in d_name_l
                        or d_name_l in orph_l
                        or (d_acr_l and (orph_l in d_acr_l or d_acr_l in orph_l))
                        or ("neonatal diabetes" in orph_l and "neonatal diabetes" in d_name_l)
                    ):
                        d["orphanet_id"] = orph_id
                        matched_existing = True
                        break
                if not matched_existing and orph_name not in seen_disease_names:
                    seen_disease_names.add(orph_name)
                    diseases.append({
                        "name": orph_name,
                        "acronym": None,
                        "disease_accession": None,
                        "description": f"Rare disease cataloged in Orphanet (ORPHA:{orph_id}).",
                        "mim_id": None,
                        "orphanet_id": orph_id,
                        "note": "Documented rare disorder associated with this gene/protein.",
                        "pubmed_ids": [],
                        "inheritance": "Rare genetic disorder",
                        "causality": "Associated",
                        "variants": [],
                        "variants_count": 0
                    })
        elif db == "Reactome":
            pname = ""
            for prop in x.get("properties", []):
                if prop.get("key") == "PathwayName":
                    pname = prop.get("value")
                    break
            if pname:
                rid = x.get("id")
                label = f"{pname} ({rid})" if rid else pname
                if label not in pathways:
                    pathways.append(label)
        elif db in ("BioCyc", "KEGG", "PathwayCommons"):
            pname = ""
            for prop in x.get("properties", []):
                if prop.get("key") in ("PathwayName", "Description"):
                    val = prop.get("value", "")
                    if val and val != "-":
                        pname = val
                        break
            if pname and pname not in pathways:
                pathways.append(pname)
            
    sequence = data.get("sequence", {})
    seq_length = sequence.get("length")
    seq_value = sequence.get("value")

    return {
        "accession": accession,
        "gene": gene,
        "organism": organism,
        "protein_name": protein_name,
        "function": functions,
        "sequence": {"length": seq_length, "fasta": seq_value},
        "domains": domains,
        "pathways": pathways,
        "diseases": diseases,
        "variants": variants,
        "cross_references": cross_refs
    }

@router.get("/api/protein/{accession}")
async def get_protein(accession: str, db: Session = Depends(get_db)):
    accession = accession.upper()
    
    prot = db.query(Protein).filter(Protein.accession == accession).first()
    
    if is_protein_stale(prot) or not prot.report_json:
        data = await fetch_uniprot_accession(accession)
        if not data:
            raise HTTPException(status_code=404, detail="UniProt accession not found")
            
        if not prot:
            gene_name = data.get("genes", [{}])[0].get("geneName", {}).get("value", "") if data.get("genes") else ""
            try:
                protein_name = data.get("proteinDescription", {}).get("recommendedName", {}).get("fullName", {}).get("value", "")
            except AttributeError:
                protein_name = ""
            taxon_id = data.get("organism", {}).get("taxonId")
            
            prot = Protein(
                accession=accession,
                gene_symbol=gene_name,
                protein_name=protein_name,
                taxon_id=taxon_id,
                sequence=data.get("sequence", {}).get("value", "")
            )
            db.add(prot)
            
        prot.report_json = data
        prot.sequence = data.get("sequence", {}).get("value", "")
        prot.fetched_at = func.now()
        db.commit()
        db.refresh(prot)

    return parse_uniprot_report(prot.report_json)

@router.get("/api/protein/{accession}/diseases")
async def get_protein_diseases(accession: str, db: Session = Depends(get_db)):
    report = await get_protein(accession, db)
    diseases = report.get("diseases", [])
    return {
        "accession": report.get("accession"),
        "gene": report.get("gene"),
        "protein_name": report.get("protein_name"),
        "total_diseases": len(diseases),
        "diseases": diseases
    }

