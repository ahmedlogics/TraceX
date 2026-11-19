#pragma once

struct ReaderDef {
  const char* code;        // readers.reader_code in the database (what the backend expects in "readerCode")
  const char* stage;       // stage the reader belongs to
  int         departmentId;// departments.id of that stage in the database
  const char* department;  // departments.name
  const char* key;         // X-Reader-Key (plain key; only its SHA-256 is stored in the database)
};

static const ReaderDef READER_DEFS[] = {
  {"RDR-RM1",    "raw_material_1",  1, "Procurement",   "553ede1d92b8bd344afb7bf85a1c682611f5fff47e94fdfc637474dce482fd71"},
  {"RDR-RM2",    "raw_material_2",  1, "Procurement",   "8113e87d68af9aeb1b9fee03570196ba43bbdef3886d08c7defacd36f952f355"},
  {"RDR-DESIGN", "design",          2, "Design",        "dfef9a75911118d4740d59dddeb3adc3dd1740852fa6a1ea55565b6cbbe10af6"},
  {"RDR-MFG1",   "manufacturing_1", 3, "Manufacturing", "684901321ac5fd29a90be66e63f004b4ce2a8a4a914be5ecaf6c9e22eda24542"},
  {"RDR-MFG2",   "manufacturing_2", 3, "Manufacturing", "3b39c197853449118549c49c8185cfc029e11aebd2462c1fdde8c2189e72aeb6"},
  {"RDR-PROD",   "production",      4, "Production",    "e0b012825dbe985784c009c1a0fe2c5d24217283ccc6d91cb4d234d162087d00"},
  {"RDR-STITCH", "stitching",       5, "Stitching + QC Gate", "21c95623d02485b1b02a8a25d1c30f2812c1fc1fb4ab102d6d6b4f4ef36da34b"},
  {"RDR-PACK",   "packaging",       6, "Packaging",     "b7de71d2010fcbd0d2fe457c7b4f7c20ec4a0b1e99563e3491dd9821b9b0daae"},
  {"RDR-SHIP",   "shipping",        7, "Shipping",      "aaebbf9c84119013fffde88af81393d43095f9e73478e0a4eade3d5f40be925e"},
};
