"""Analyze the CSV exported by the platform. Python standard library only."""
import argparse
import csv
import json
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

def analyze(path):
    totals = defaultdict(lambda: {'received_kg': 0, 'shipped_kg': 0})
    stocks = defaultdict(int)
    with Path(path).open(encoding='utf-8-sig', newline='') as stream:
        for row in csv.DictReader(stream, delimiter=';'):
            quantity = int(row['Quantidade_kg'])
            if quantity <= 0: raise ValueError('Movement quantity must be positive')
            product, origin, destination = row['Produto'], row['Origem'], row['Destino']
            if origin == 'external': totals[product]['received_kg'] += quantity
            if destination == 'truck': totals[product]['shipped_kg'] += quantity
            if origin != 'external': stocks[origin] -= quantity
            stocks[destination] += quantity
    products = {p: {'received_t': str(Decimal(v['received_kg']) / 1000), 'shipped_t': str(Decimal(v['shipped_kg']) / 1000), 'remaining_t': str(Decimal(v['received_kg']-v['shipped_kg']) / 1000)} for p, v in totals.items()}
    return {'products': products, 'locations_t': {p: str(Decimal(q)/1000) for p,q in stocks.items() if p != 'truck'}, 'note': 'Saldo remanescente não comprova perda. Divergências exigem medições físicas.'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Análise de movimentações FertiliTrace')
    parser.add_argument('csv')
    parser.add_argument('--output')
    args = parser.parse_args()
    result = json.dumps(analyze(args.csv), ensure_ascii=False, indent=2)
    if args.output: Path(args.output).write_text(result, encoding='utf-8')
    else: print(result)
