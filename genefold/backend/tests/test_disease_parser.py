import pytest
from app.routers.protein import parse_uniprot_report, detect_inheritance, detect_causality

def test_detect_inheritance():
    assert detect_inheritance("Inheritance is autosomal dominant.") == "Autosomal dominant"
    assert detect_inheritance("Transmitted in an autosomal recessive manner.") == "Autosomal recessive"
    assert detect_inheritance("Associated with an X-linked recessive disorder.") == "X-linked"
    assert detect_inheritance("Common somatic mutations in human cancers.") == "Somatic / Sporadic"
    assert detect_inheritance("Confers genetic susceptibility to breast cancer.") == "Genetic susceptibility"
    assert detect_inheritance("No known pattern described.") == "Not specified"

def test_detect_causality():
    assert detect_causality("The disease is caused by variants affecting the gene", "") == "Causative"
    assert detect_causality("", "Known to increase cancer susceptibility in carriers") == "Genetic susceptibility"
    assert detect_causality("Involved in the pathogenesis of chronic renal disease", "") == "Involved in pathogenesis"
    assert detect_causality("", "Observed in clinical cohorts") == "Associated"

def test_parse_uniprot_report_diseases():
    mock_data = {
        "primaryAccession": "P04637",
        "genes": [{"geneName": {"value": "TP53"}}],
        "proteinDescription": {
            "recommendedName": {"fullName": {"value": "Cellular tumor antigen p53"}}
        },
        "organism": {"taxonId": 9606},
        "comments": [
            {
                "commentType": "DISEASE",
                "disease": {
                    "diseaseId": "Li-Fraumeni syndrome",
                    "diseaseAccession": "DI-01904",
                    "acronym": "LFS",
                    "description": "An autosomal dominant familial cancer syndrome.",
                    "diseaseCrossReference": {"database": "MIM", "id": "151623"},
                    "evidences": [{"source": "PubMed", "id": "10484981"}]
                },
                "note": {
                    "texts": [{"value": "The disease is caused by variants affecting the gene represented in this entry."}]
                }
            },
            {
                "commentType": "DISEASE",
                "note": {
                    "texts": [{"value": "Frequently mutated or inactivated in about 60% of cancers."}]
                }
            }
        ],
        "features": [
            {
                "type": "Natural variant",
                "location": {"start": {"value": 175}, "end": {"value": 175}},
                "description": "in LFS; germline mutation; pathogenic",
                "featureId": "VAR_005851",
                "alternativeSequence": {
                    "originalSequence": "R",
                    "alternativeSequences": ["H"]
                }
            }
        ],
        "uniProtKBCrossReferences": [
            {
                "database": "Orphanet",
                "id": "524",
                "properties": [{"key": "Disease", "value": "Li-Fraumeni syndrome"}]
            },
            {
                "database": "Orphanet",
                "id": "999",
                "properties": [{"key": "Disease", "value": "Novel Rare Disorder"}]
            }
        ],
        "sequence": {"length": 393, "value": "MEEPQ..."}
    }

    report = parse_uniprot_report(mock_data)

    assert report["accession"] == "P04637"
    assert report["gene"] == "TP53"
    assert len(report["diseases"]) == 3  # LFS, general pathology note, and Novel Rare Disorder
    
    lfs = next((d for d in report["diseases"] if d["name"] == "Li-Fraumeni syndrome"), None)
    assert lfs is not None
    assert lfs["acronym"] == "LFS"
    assert lfs["mim_id"] == "151623"
    assert lfs["orphanet_id"] == "524"
    assert lfs["inheritance"] == "Autosomal dominant"
    assert lfs["causality"] == "Causative"
    assert lfs["pubmed_ids"] == ["10484981"]
    assert lfs["variants_count"] == 1
    assert lfs["variants"][0]["position"] == 175
    assert lfs["variants"][0]["change"] == "R->H"

    # Check variant has associated disease
    var = report["variants"][0]
    assert len(var["associated_diseases"]) == 1
    assert "Li-Fraumeni syndrome (LFS)" in var["associated_diseases"]

    # Check novel orphanet disease
    novel = next((d for d in report["diseases"] if d["name"] == "Novel Rare Disorder"), None)
    assert novel is not None
    assert novel["orphanet_id"] == "999"

def test_diseases_endpoint():
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)
    response = client.get("/api/protein/P04637/diseases")
    assert response.status_code == 200
    data = response.json()
    assert data["accession"] == "P04637"
    assert data["total_diseases"] > 0
    assert len(data["diseases"]) == data["total_diseases"]
    first = data["diseases"][0]
    assert "name" in first
    assert "causality" in first

