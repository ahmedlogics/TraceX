#pragma once

struct ReaderDef {
  const char* code;        // readers.reader_code in the database
  const char* stage;       // stage the reader belongs to
  int         departmentId;// departments.id of that stage in the database
  const char* department;  // departments.name
  const char* key;         // X-Reader-Key (plain key; only its SHA-256 is stored in the database)
};

static const ReaderDef READER_DEFS[] = {
  {"RDR-RM1",    "raw_material_1",  1, "Procurement",   "YOUR_READER_KEY_HEX_1"},
  {"RDR-RM2",    "raw_material_2",  1, "Procurement",   "YOUR_READER_KEY_HEX_2"},
  {"RDR-DESIGN", "design",          2, "Design",        "YOUR_READER_KEY_HEX_3"},
  {"RDR-MFG1",   "manufacturing_1", 3, "Manufacturing", "YOUR_READER_KEY_HEX_4"},
  {"RDR-MFG2",   "manufacturing_2", 3, "Manufacturing", "YOUR_READER_KEY_HEX_5"},
  {"RDR-PROD",   "production",      4, "Production",    "YOUR_READER_KEY_HEX_6"},
  {"RDR-STITCH", "stitching",       5, "Stitching + QC Gate", "YOUR_READER_KEY_HEX_7"},
  {"RDR-PACK",   "packaging",       6, "Packaging",     "YOUR_READER_KEY_HEX_8"},
  {"RDR-SHIP",   "shipping",        7, "Shipping",      "YOUR_READER_KEY_HEX_9"},
};
