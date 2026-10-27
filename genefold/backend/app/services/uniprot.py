import httpx
import asyncio
from typing import List, Dict, Any, Optional

async def _fetch(method: str, url: str, **kwargs) -> httpx.Response:
    max_retries = 3
    timeout = kwargs.pop("timeout", 10.0)
    async with httpx.AsyncClient() as client:
        for attempt in range(max_retries):
            try:
                resp = await client.request(method, url, timeout=timeout, **kwargs)
                if resp.status_code == 404:
                    return resp
                resp.raise_for_status()
                return resp
            except (httpx.RequestError, httpx.HTTPStatusError) as e:
                if attempt == max_retries - 1:
                    raise
                await asyncio.sleep(2 ** attempt)

async def fetch_uniprot_search(query: str, organism: str) -> Dict[str, Any]:
    url = f"https://rest.uniprot.org/uniprotkb/search?query=gene_exact:{query} AND organism_id:{organism} AND reviewed:true"
    resp = await _fetch("GET", url)
    return resp.json() if resp.status_code == 200 else {}

async def fetch_uniprot_accession(accession: str) -> Optional[Dict[str, Any]]:
    url = f"https://rest.uniprot.org/uniprotkb/{accession}"
    resp = await _fetch("GET", url)
    if resp.status_code == 404:
        return None
    return resp.json()

async def fetch_id_mapping(from_db: str, to_db: str, ids: str) -> List[str]:
    resp = await _fetch("POST", "https://rest.uniprot.org/idmapping/run", data={"from": from_db, "to": to_db, "ids": ids})
    if resp.status_code != 200:
        return []
    job_id = resp.json()["jobId"]
    
    # Poll
    for _ in range(15):
        await asyncio.sleep(2)
        status_resp = await _fetch("GET", f"https://rest.uniprot.org/idmapping/status/{job_id}")
        if status_resp.status_code != 200:
            continue
        status_data = status_resp.json()
        
        # Check for results directly
        if "results" in status_data:
            return [r["to"] for r in status_data["results"]]
            
        if status_data.get("jobStatus") == "FINISHED":
            res_resp = await _fetch("GET", f"https://rest.uniprot.org/idmapping/results/{job_id}")
            if res_resp.status_code == 200:
                res_data = res_resp.json()
                return [r["to"] for r in res_data.get("results", [])]
        elif status_data.get("jobStatus") == "ERROR":
            break
            
    return []

async def fetch_rcsb_uniprot(pdb_id: str) -> Optional[str]:
    query = """
    {
      entry(entry_id: "%s") {
        polymer_entities {
          rcsb_polymer_entity_container_identifiers {
            reference_sequence_identifiers {
              database_name
              database_accession
            }
          }
        }
      }
    }
    """ % pdb_id.upper()
    
    resp = await _fetch("POST", "https://data.rcsb.org/graphql", json={"query": query})
    if resp.status_code != 200:
        return None
    data = resp.json()
    try:
        entities = data.get("data", {}).get("entry", {}).get("polymer_entities", [])
        for entity in entities:
            refs = entity.get("rcsb_polymer_entity_container_identifiers", {}).get("reference_sequence_identifiers", [])
            if refs:
                for ref in refs:
                    if ref.get("database_name") == "UniProt":
                        return ref.get("database_accession")
    except (KeyError, TypeError, AttributeError):
        pass
    return None
