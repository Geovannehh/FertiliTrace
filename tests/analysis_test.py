import csv
import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('fertili_analysis', ROOT / 'analysis/analyze.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PlatformTests(unittest.TestCase):
    def test_export_balance_has_no_internal_double_count(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'movement.csv'
            with path.open('w', encoding='utf-8-sig', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=['Produto','Origem','Destino','Quantidade_kg'], delimiter=';')
                writer.writeheader()
                sequence = ['external','ship','unload','conveyor','warehouse','B04','truck']
                for i in range(6):
                    writer.writerow({'Produto':'Ureia','Origem':sequence[i],'Destino':sequence[i+1],'Quantidade_kg':1250000 if i<5 else 1210000})
            result = module.analyze(path)
            self.assertEqual(result['products']['Ureia'], {'received_t':'1250','shipped_t':'1210','remaining_t':'40'})
            self.assertEqual(result['locations_t']['B04'], '40')
            self.assertTrue(all(result['locations_t'][k] == '0' for k in ['ship','unload','conveyor','warehouse']))

    def test_sqlite_revision_prevents_stale_overwrite(self):
        db = sqlite3.connect(':memory:')
        db.executescript((ROOT / 'drizzle/0000_cooing_sheva_callister.sql').read_text())
        db.execute('INSERT OR IGNORE INTO fertili_ledgers (id,revision,payload) VALUES (?,?,?)', ('main',0,'original'))
        db.execute('INSERT OR IGNORE INTO fertili_ledgers (id,revision,payload) VALUES (?,?,?)', ('main',0,'reset'))
        self.assertEqual(db.execute('SELECT payload FROM fertili_ledgers').fetchone()[0], 'original')
        sql = 'UPDATE fertili_ledgers SET payload = ?, revision = revision + 1 WHERE id = ? AND revision = ?'
        self.assertEqual(db.execute(sql, ('first','main',0)).rowcount, 1)
        self.assertEqual(db.execute(sql, ('stale','main',0)).rowcount, 0)
        self.assertEqual(db.execute('SELECT revision,payload FROM fertili_ledgers').fetchone(), (1,'first'))
        db.close()

if __name__ == '__main__': unittest.main()
