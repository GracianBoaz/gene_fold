from app.services.classifier import classify

def test_classify_gene_symbol():
    assert classify("TP53") == "gene_symbol"
    assert classify("BRCA1") == "gene_symbol"

def test_classify_ncbi_gene_id():
    assert classify("7157") == "ncbi_gene_id"

def test_classify_uniprot_accession():
    assert classify("P04637") == "uniprot_accession"
    assert classify("Q9Y6K9") == "uniprot_accession"
    assert classify("A0A024R161") == "uniprot_accession"

def test_classify_refseq_protein():
    assert classify("NP_000537.3") == "refseq_protein"
    assert classify("XP_011509930") == "refseq_protein"
    assert classify("YP_009724390") == "refseq_protein"

def test_classify_pdb_id():
    assert classify("1TUP") == "pdb_id"

def test_whitespace_and_case():
    assert classify("  tp53 \n") == "gene_symbol"
    assert classify(" 1tup ") == "pdb_id"
    assert classify("p04637") == "uniprot_accession"
    assert classify(" np_000537.3 ") == "refseq_protein"
