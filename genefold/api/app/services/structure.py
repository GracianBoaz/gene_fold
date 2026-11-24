import httpx
import asyncio
from typing import List, Dict, Any

async def _fetch_rcsb_entry(client: httpx.AsyncClient, pdb_id: str) -> dict:
    url = f"https://data.rcsb.org/rest/v1/core/entry/{pdb_id}"
    resp = await client.get(url, timeout=10.0)
    resp.raise_for_status()
    data = resp.json()
    
    exptl = data.get("exptl", [{}])
    method = exptl[0].get("method", "Unknown") if exptl else "Unknown"
    
    resolution = None
    res_comb = data.get("rcsb_entry_info", {}).get("resolution_combined")
    if res_comb:
        resolution = res_comb[0]
        
    return {
        "source": "RCSB",
        "struct_id": pdb_id,
        "method": method,
        "resolution": resolution,
        "file_url": f"https://files.rcsb.org/download/{pdb_id}.pdb",
        "file_format": "pdb"
    }

async def fetch_rcsb_structures(accession: str) -> List[dict]:
    query = {
        "query": {
            "type": "terminal",
            "service": "text",
            "parameters": {
                "attribute": "rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession",
                "operator": "exact_match",
                "value": accession
            }
        },
        "request_options": {
            "paginate": {"start": 0, "rows": 25}
        },
        "return_type": "entry"
    }
    
    async with httpx.AsyncClient() as client:
        resp = await client.post("https://search.rcsb.org/rcsbsearch/v2/query", json=query, timeout=10.0)
        if resp.status_code == 204:
            return []
        resp.raise_for_status()
        result_set = resp.json().get("result_set", [])
        pdb_ids = [r["identifier"] for r in result_set]
        
        tasks = [_fetch_rcsb_entry(client, pid) for pid in pdb_ids]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        valid_results = [r for r in results if not isinstance(r, Exception)]
        return valid_results

async def fetch_alphafold_structures(accession: str) -> List[dict]:
    url = f"https://alphafold.ebi.ac.uk/api/prediction/{accession}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, timeout=10.0)
        if resp.status_code == 404:
            return []
        resp.raise_for_status()
        data = resp.json()
        
        structures = []
        for item in data:
            structures.append({
                "source": "AlphaFold",
                "struct_id": item.get("entryId", f"AF-{accession}"),
                "method": "AlphaFold",
                "resolution": None,
                "plddt": item.get("globalMetricValue"),
                "file_url": item.get("pdbUrl"),
                "file_format": "pdb"
            })
        return structures
