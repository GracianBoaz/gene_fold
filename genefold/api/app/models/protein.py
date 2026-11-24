from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base

class Protein(Base):
    __tablename__ = "protein"

    accession = Column(String, primary_key=True)
    gene_symbol = Column(String)
    protein_name = Column(String)
    taxon_id = Column(Integer)
    sequence = Column(String)
    report_json = Column(JSONB)
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())

    id_maps = relationship("IdMap", back_populates="protein")
    structures = relationship("Structure", back_populates="protein")

class IdMap(Base):
    __tablename__ = "id_map"

    id_value = Column(String, primary_key=True)
    id_type = Column(String, primary_key=True)
    taxon_id = Column(Integer, primary_key=True)
    accession = Column(String, ForeignKey("protein.accession"))

    protein = relationship("Protein", back_populates="id_maps")

    __table_args__ = (
        Index("ix_id_map_id_value", "id_value"),
    )

class Structure(Base):
    __tablename__ = "structure"

    id = Column(Integer, primary_key=True, index=True)
    accession = Column(String, ForeignKey("protein.accession"))
    source = Column(String)
    struct_id = Column(String)
    method = Column(String)
    resolution = Column(Float, nullable=True)
    file_url = Column(String)
    file_format = Column(String)

    protein = relationship("Protein", back_populates="structures")

    __table_args__ = (
        UniqueConstraint("source", "struct_id", name="uq_structure_source_struct_id"),
    )
