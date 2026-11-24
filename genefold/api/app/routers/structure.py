from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from urllib.parse import urlparse
import httpx
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.protein import Structure
from ..services.structure import fetch_rcsb_structures, fetch_alphafold_structures

router = APIRouter()

@router.get("/api/structures/{accession}")
async def get_structures(accession: str, db: Session = Depends(get_db)):
    accession = accession.upper()
    
    rcsb_structures = []
    rcsb_error = None
    try:
        rcsb_structures = await fetch_rcsb_structures(accession)
    except Exception as e:
        rcsb_error = str(e)
        
    af_structures = []
    af_error = None
    try:
        af_structures = await fetch_alphafold_structures(accession)
    except Exception as e:
        af_error = str(e)
        
    all_structs = rcsb_structures + af_structures
    
    for s in all_structs:
        record = db.query(Structure).filter(
            Structure.source == s["source"],
            Structure.struct_id == s["struct_id"]
        ).first()
        if not record:
            record = Structure(
                accession=accession,
                source=s["source"],
                struct_id=s["struct_id"],
                method=s["method"],
                resolution=s["resolution"],
                file_url=s["file_url"],
                file_format=s["file_format"]
            )
            db.add(record)
        else:
            record.resolution = s["resolution"]
            record.file_url = s["file_url"]
    
    db.commit()

    # Sort: Experimental by best resolution first, then AlphaFold
    rcsb_sorted = sorted(rcsb_structures, key=lambda x: x["resolution"] if x["resolution"] is not None else 9999.0)
    af_sorted = af_structures
    
    final_list = rcsb_sorted + af_sorted
    
    response = {
        "structures": final_list
    }
    
    warnings = []
    if rcsb_error:
        warnings.append(f"RCSB fetch failed: {rcsb_error}")
    if af_error:
        warnings.append(f"AlphaFold fetch failed: {af_error}")
        
    if warnings:
        response["warnings"] = warnings
        
    return response

@router.get("/api/structure-file")
async def get_structure_file(url: str):
    parsed = urlparse(url)
    allowed_hosts = ["files.rcsb.org", "alphafold.ebi.ac.uk"]
    if parsed.hostname not in allowed_hosts:
        raise HTTPException(status_code=400, detail="Invalid host. Only RCSB and AlphaFold are allowed.")

    async def stream_file():
        async with httpx.AsyncClient() as client:
            try:
                # Set a timeout for connection/read (15 seconds total or per operation)
                async with client.stream("GET", url, timeout=15.0, follow_redirects=True) as response:
                    if response.status_code != 200:
                        raise HTTPException(status_code=response.status_code, detail="Failed to fetch file")
                    
                    # Optional: check Content-Length header before downloading
                    content_length = response.headers.get("Content-Length")
                    if content_length and int(content_length) > 50 * 1024 * 1024:
                        raise HTTPException(status_code=413, detail="File too large (over 50MB)")
                    
                    downloaded = 0
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        downloaded += len(chunk)
                        if downloaded > 50 * 1024 * 1024:
                            raise HTTPException(status_code=413, detail="File too large (over 50MB during download)")
                        yield chunk
            except httpx.RequestError as e:
                raise HTTPException(status_code=502, detail=f"Error connecting to upstream: {str(e)}")

    return StreamingResponse(stream_file(), media_type="application/octet-stream")
