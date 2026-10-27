from datetime import datetime, timezone, timedelta
from typing import Optional
from ..models.protein import Protein

def is_protein_stale(protein: Optional[Protein]) -> bool:
    """
    Returns True if the protein record is missing or older than 7 days.
    """
    if not protein or not protein.fetched_at:
        return True
    
    # Ensure timezone awareness for comparison
    now = datetime.now(timezone.utc)
    fetched_at = protein.fetched_at
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=timezone.utc)
        
    return now - fetched_at > timedelta(days=7)
