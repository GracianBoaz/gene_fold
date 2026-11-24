import re

def classify(query: str) -> str:
    query = query.strip().upper()
    
    # NCBI Gene ID: digits only
    if query.isdigit():
        return "ncbi_gene_id"
        
    # PDB ID: exactly 4 characters starting with a digit
    if re.match(r"^\d[A-Z0-9]{3}$", query):
        return "pdb_id"
        
    # RefSeq protein: starts with NP_, XP_, or YP_
    if re.match(r"^(NP|XP|YP)_\d+(\.\d+)?$", query):
        return "refseq_protein"
        
    # UniProt accession: standard UniProt regex
    # Matches P04637, Q9Y6K9, A0A024R161, etc.
    uniprot_pattern = r"^([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2})$"
    if re.match(uniprot_pattern, query):
        return "uniprot_accession"
        
    # Otherwise
    return "gene_symbol"
