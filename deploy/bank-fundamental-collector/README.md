# Bank Fundamental Official-Source Collector

Collector hanya mengunjungi domain resmi issuer yang terdaftar di `config/bank-fundamental-sources.json`.
Tidak memakai search engine atau aggregator di production.

PDF diekstrak dengan `pdftotext` (Poppler). OCR sengaja tidak digunakan: PDF tanpa text layer akan dilewati agar angka tidak ditebak.

## Install dependency

```bash
sudo apt-get update
sudo apt-get install -y poppler-utils
```

## Dry-run manual

```bash
cd /opt/sahamlens/app
node scripts/collect-bank-metric-evidence-auto.mjs
```

## Confirm manual

```bash
NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection" \
node --env-file=.env.production scripts/collect-bank-metric-evidence-auto.mjs --confirm
```

## Timer

```bash
bash deploy/bank-fundamental-collector/install.sh
sudo systemctl start sahamlens-bank-fundamental-collector.service
sudo journalctl -u sahamlens-bank-fundamental-collector.service -n 100 --no-pager
```

Default polling harian 20:45 WIB + random delay <=10 menit. Karena laporan bank bersifat periodik, polling harian cukup dan menghindari beban berlebihan pada situs issuer.
