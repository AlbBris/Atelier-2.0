'use strict';

const APP_VERSION = '1.7.0';
const DB_NAME = 'atelier20-db';
const DB_VERSION = 3;
const STORE_NAME = 'appState';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const integer = value => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(num(value));
const decimal = value => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(num(value));
const money = value => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num(value));
const dateFr = value => value ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';
const dateTimeFr = value => value ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const normalizeText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const normalizeFilamentCode = value => {
  const match = String(value || '').toUpperCase().match(/FIL[-_\s]?(\d{1,8})/);
  return match ? `FIL-${String(Number(match[1])).padStart(4, '0')}` : '';
};
function nextFilamentCode(usedCodes = null) {
  const used = usedCodes || new Set(state.filaments.map(item => normalizeFilamentCode(item.code)).filter(Boolean));
  let max = 0;
  used.forEach(code => { const n = Number(code.replace('FIL-', '')); if (Number.isFinite(n)) max = Math.max(max, n); });
  let next = max + 1;
  let code = `FIL-${String(next).padStart(4, '0')}`;
  while (used.has(code)) { next += 1; code = `FIL-${String(next).padStart(4, '0')}`; }
  return code;
}
function ensureFilamentCodes(list = state.filaments) {
  const used = new Set();
  list.forEach(item => {
    let code = normalizeFilamentCode(item.code);
    if (!code || used.has(code)) code = nextFilamentCode(used);
    item.code = code;
    used.add(code);
  });
}

const normalizeMachineCode = value => {
  const match = String(value || '').toUpperCase().match(/MAC[-_\s]?(\d{1,8})/);
  return match ? `MAC-${String(Number(match[1])).padStart(4, '0')}` : '';
};
function nextMachineCode(usedCodes = null) {
  const used = usedCodes || new Set(state.machines.map(item => normalizeMachineCode(item.code)).filter(Boolean));
  let max = 0;
  used.forEach(code => { const n = Number(code.replace('MAC-', '')); if (Number.isFinite(n)) max = Math.max(max, n); });
  let next = max + 1;
  let code = `MAC-${String(next).padStart(4, '0')}`;
  while (used.has(code)) { next += 1; code = `MAC-${String(next).padStart(4, '0')}`; }
  return code;
}
function ensureMachineCodes(list = state.machines) {
  const used = new Set();
  list.forEach(item => {
    let code = normalizeMachineCode(item.code);
    if (!code || used.has(code)) code = nextMachineCode(used);
    item.code = code;
    used.add(code);
  });
}
function daysUntil(value) {
  if (!value) return null;
  const target = new Date(`${value}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(); today.setHours(12,0,0,0);
  return Math.ceil((target - today) / 86400000);
}
function machineMaintenanceInfo(machine) {
  if (!machine.nextMaintenance) return { key: 'none', label: 'Entretien non planifié', tone: '', days: null };
  const days = daysUntil(machine.nextMaintenance);
  if (days === null) return { key: 'none', label: 'Date invalide', tone: '', days: null };
  if (days < 0) return { key: 'overdue', label: `En retard de ${Math.abs(days)} j`, tone: 'danger', days };
  if (days === 0) return { key: 'today', label: 'À faire aujourd’hui', tone: 'danger', days };
  if (days <= 14) return { key: 'soon', label: `Dans ${days} j`, tone: 'amber', days };
  return { key: 'ok', label: dateFr(machine.nextMaintenance), tone: 'success', days };
}
function machineWarrantyInfo(machine) {
  if (!machine.warrantyUntil) return '';
  const days = daysUntil(machine.warrantyUntil);
  if (days === null) return '';
  if (days < 0) return `Garantie expirée le ${dateFr(machine.warrantyUntil)}`;
  return `Garantie jusqu’au ${dateFr(machine.warrantyUntil)}`;
}
function filamentByCode(value) {
  const code = parseFilamentCode(value);
  return state.filaments.find(item => normalizeFilamentCode(item.code) === code) || null;
}
function parseFilamentCode(value) {
  const raw = String(value || '').trim();
  try {
    const url = new URL(raw);
    const queryCode = normalizeFilamentCode(url.searchParams.get('filament'));
    if (queryCode) return queryCode;
  } catch (error) {}
  return normalizeFilamentCode(raw);
}
function filamentQrPayload(filament) {
  const code = normalizeFilamentCode(filament.code);
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?filament=${encodeURIComponent(code)}`;
  }
  return `ATELIER20:FILAMENT:${code}`;
}
function qrToDataUrl(text, size = 240) {
  const holder = document.createElement('div');
  holder.style.position = 'fixed'; holder.style.left = '-10000px'; holder.style.top = '0';
  document.body.append(holder);
  try {
    new QRCode(holder, { text, width: size, height: size, colorDark: '#111111', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    const canvas = holder.querySelector('canvas');
    const image = holder.querySelector('img');
    return canvas ? canvas.toDataURL('image/png') : image?.src || '';
  } finally { holder.remove(); }
}
let activeScannerStream = null;
let activeScannerFrame = null;
function stopQrScanner() {
  if (activeScannerFrame) cancelAnimationFrame(activeScannerFrame);
  activeScannerFrame = null;
  if (activeScannerStream) activeScannerStream.getTracks().forEach(track => track.stop());
  activeScannerStream = null;
}

const STATUS_OPTIONS = ['Brouillon', 'En préparation', 'En fabrication', 'Terminé', 'Archivé'];
const STOCK_TYPES = [
  ['linear', 'Linéaire / barre'], ['sheet', 'Panneau'], ['count', 'À l’unité'], ['weight', 'Au poids'], ['volume', 'Au volume'], ['other', 'Autre']
];
const STOCK_CATEGORIES = ['Bois', 'Panneaux', 'Métal', 'Quincaillerie', 'Électricité', 'Peinture et colle', 'Consommables', 'Autre'];
const STOCK_ICONS = { linear: '╱', sheet: '▰', count: '●', weight: '⚖', volume: '◒', other: '◆' };

const emptyState = () => ({
  settings: { owner: 'Alban', electricityPrice: 0.2516, printerPowerKw: 0.12, units: 'mm', onboardingDone: false, defaultKerfMm: 3, defaultMinScrapMm: 250 },
  projects: [],
  inventory: [],
  filaments: [],
  tools: [],
  machines: [],
  cutJobs: [],
  movements: [],
  workshopMap: { name: 'Atelier principal', widthMm: 0, depthMm: 0, backgroundImage: '', markers: [] },
  ui: { route: 'home', selectedProjectId: null, projectTab: 'summary', workshopTab: 'materials', equipmentTab: 'machines', atelierTab: 'plan', cutTab: 'linear' },
  meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: APP_VERSION }
});

function demoState() {
  const base = emptyState();
  base.settings.onboardingDone = true;
  const woodId = uid('stock');
  const scrapId = uid('stock');
  const screwsId = uid('stock');
  const filamentId = uid('filament');
  const machineId = uid('machine');
  base.inventory = [
    { id: woodId, category: 'Bois', name: 'Tasseau sapin 35 × 60 mm', material: 'Sapin', stockType: 'linear', unit: 'barre', quantity: 6, reserved: 0, lengthMm: 3000, widthMm: 60, thicknessMm: 35, location: 'Râtelier bois', unitCost: 5.9, lowThreshold: 2, notes: '', isScrap: false, origin: '', parentStockId: null },
    { id: scrapId, category: 'Bois', name: 'Chute tasseau sapin 35 × 60 mm', material: 'Sapin', stockType: 'linear', unit: 'barre', quantity: 1, reserved: 0, lengthMm: 780, widthMm: 60, thicknessMm: 35, location: 'Bac à chutes', unitCost: 0, lowThreshold: 0, notes: 'Chute propre', isScrap: true, origin: 'Découpe précédente', parentStockId: woodId },
    { id: screwsId, category: 'Quincaillerie', name: 'Vis extérieure 5 × 80 mm', material: 'Acier zingué', stockType: 'count', unit: 'pièce', quantity: 120, reserved: 0, lengthMm: 80, widthMm: 5, thicknessMm: 0, location: 'Meuble quincaillerie • Bac B3', unitCost: 0.12, lowThreshold: 20, notes: '', isScrap: false, origin: '', parentStockId: null }
  ];
  base.filaments = [{ id: filamentId, code: 'FIL-0001', brand: 'Bambu Lab', range: 'Basic', material: 'PETG', colorName: 'Noir', colorHex: '#191919', initialWeight: 1000, remainingWeight: 612, reservedWeight: 0, spoolWeight: 250, price: 19.99, location: 'Zone impression 3D • Étagère 2', openedAt: '2026-07-01', nozzle: 245, bed: 75, notes: '' }];
  base.tools = [{ id: uid('tool'), name: 'Visseuse', category: 'Électroportatif', location: 'Servante • Tiroir 1', notes: '' }];
  base.machines = [
    { id: machineId, code: 'MAC-0001', name: 'Scie à onglet', category: 'Découpe', brand: 'Metabo', model: '', serialNumber: '', location: 'Établi principal', status: 'Disponible', purchaseDate: '', purchasePrice: 0, warrantyUntil: '', powerW: 1800, kerfMm: 3, capacityMm: 305, lastMaintenance: '2026-06-15', nextMaintenance: '2026-09-15', maintenanceIntervalDays: 90, manualUrl: '', accessories: ['Lame bois 60 dents', 'Butée de longueur'], consumableStockIds: [], maintenanceHistory: [{ id: uid('maint'), date: '2026-06-15', type: 'Nettoyage', cost: 0, operatingHours: 0, notes: 'Aspiration et contrôle de la lame', nextDue: '2026-09-15' }], notes: 'Lame bois installée' },
    { id: uid('machine'), code: 'MAC-0002', name: 'Bambu Lab A1', category: 'Impression 3D', brand: 'Bambu Lab', model: 'A1', serialNumber: '', location: 'Zone impression 3D', status: 'Disponible', purchaseDate: '', purchasePrice: 0, warrantyUntil: '', powerW: 350, kerfMm: 0, capacityMm: 256, lastMaintenance: '2026-07-10', nextMaintenance: '2026-08-10', maintenanceIntervalDays: 30, manualUrl: 'https://wiki.bambulab.com/en/a1', accessories: ['Buse 0,4 mm', 'Plateau texturé PEI'], consumableStockIds: [], maintenanceHistory: [{ id: uid('maint'), date: '2026-07-10', type: 'Lubrification', cost: 0, operatingHours: 0, notes: 'Nettoyage et lubrification des axes', nextDue: '2026-08-10' }], notes: 'Profil PETG validé' }
  ];
  base.cutJobs = [];
  base.workshopMap = {
    name: 'Atelier principal', widthMm: 3000, depthMm: 1800, backgroundImage: '',
    markers: [
      { id: uid('map'), name: 'Zone bois', location: 'Zone bois', type: 'stock', xPct: 3, yPct: 7, widthPct: 26, heightPct: 34 },
      { id: uid('map'), name: 'Établi principal', location: 'Établi principal', type: 'machine', xPct: 35, yPct: 10, widthPct: 28, heightPct: 24 },
      { id: uid('map'), name: 'Quincaillerie', location: 'Meuble quincaillerie', type: 'storage', xPct: 69, yPct: 7, widthPct: 27, heightPct: 38 },
      { id: uid('map'), name: 'Impression 3D', location: 'Zone impression 3D', type: 'machine', xPct: 36, yPct: 57, widthPct: 30, heightPct: 32 },
      { id: uid('map'), name: 'Servante', location: 'Servante', type: 'tool', xPct: 5, yPct: 59, widthPct: 24, heightPct: 28 }
    ]
  };
  return base;
}

let state = emptyState();
let db = null;
let searchOverlay = null;

const routes = [
  { id: 'home', label: 'Accueil', icon: '⌂' },
  { id: 'inventory', label: 'Inventaire', icon: '▦' },
  { id: 'cuts', label: 'Découpes', icon: '✂' },
  { id: 'filaments', label: 'Bobines', icon: '◉' },
  { id: 'equipment', label: 'Équipements', mobileLabel: 'Équip.', icon: '⚙' },
  { id: 'atelier', label: 'Atelier', mobileLabel: 'Plan', icon: '⌖' }
];

function openDb() {
  if (window.location.protocol === 'file:') return Promise.reject(new Error('IndexedDB indisponible en ouverture directe'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function normalizeInventoryItem(item = {}) {
  const stockType = String(item.stockType || item.stock_type || inferStockType(item)).toLowerCase();
  const quantity = Math.max(0, num(item.quantity ?? item.qty ?? item.available_quantity ?? 0));
  return {
    id: item.id || uid('stock'),
    category: String(item.category || inferCategory(item.name || item.material) || 'Autre'),
    name: String(item.name || item.label || item.designation || 'Élément de stock'),
    material: String(item.material || ''),
    stockType: ['linear','sheet','count','weight','volume','other'].includes(stockType) ? stockType : 'other',
    unit: String(item.unit || defaultUnit(stockType)),
    quantity,
    reserved: clamp(num(item.reserved ?? item.reserved_quantity ?? 0), 0, quantity),
    lengthMm: Math.max(0, num(item.lengthMm ?? item.length_mm ?? item.dimensions?.length_mm ?? 0)),
    widthMm: Math.max(0, num(item.widthMm ?? item.width_mm ?? item.dimensions?.width_mm ?? item.section_mm?.width ?? 0)),
    thicknessMm: Math.max(0, num(item.thicknessMm ?? item.thickness_mm ?? item.dimensions?.thickness_mm ?? item.section_mm?.height ?? 0)),
    location: String(item.location || item.storage_location || ''),
    unitCost: Math.max(0, num(item.unitCost ?? item.unit_cost ?? item.price_per_unit ?? 0)),
    lowThreshold: Math.max(0, num(item.lowThreshold ?? item.low_threshold ?? 0)),
    notes: String(item.notes || ''),
    isScrap: Boolean(item.isScrap ?? item.is_scrap ?? item.scrap ?? false),
    origin: String(item.origin || item.source || ''),
    parentStockId: item.parentStockId || item.parent_stock_id || null
  };
}

function normalizeFilament(item = {}) {
  const remaining = Math.max(0, num(item.remainingWeight ?? item.remaining_weight_g ?? item.remaining_g ?? item.quantity ?? 0));
  return {
    id: item.id || uid('filament'),
    code: normalizeFilamentCode(item.code || item.qrCode || item.qr_code || item.identifier || item.identifiant || ''),
    brand: String(item.brand || item.marque || ''), range: String(item.range || item.gamme || ''),
    material: String(item.material || item.matiere || 'PLA').toUpperCase(),
    colorName: String(item.colorName || item.color_name || item.color || item.couleur || 'Non précisée'),
    colorHex: String(item.colorHex || item.color_hex || '#8B7361'),
    initialWeight: Math.max(1, num(item.initialWeight ?? item.initial_weight_g ?? item.initial_g ?? 1000)),
    remainingWeight: remaining,
    reservedWeight: clamp(num(item.reservedWeight ?? item.reserved_weight_g ?? 0), 0, remaining),
    spoolWeight: Math.max(0, num(item.spoolWeight ?? item.spool_weight_g ?? 0)),
    price: Math.max(0, num(item.price ?? item.purchase_price ?? 0)),
    location: String(item.location || item.storage_location || ''),
    openedAt: item.openedAt || item.opened_at || '', nozzle: num(item.nozzle ?? item.nozzle_temperature ?? 0), bed: num(item.bed ?? item.bed_temperature ?? 0), notes: String(item.notes || '')
  };
}

function normalizeTool(item = {}) {
  return { id: item.id || uid('tool'), name: String(item.name || item.label || 'Outil'), category: String(item.category || 'Outillage'), location: String(item.location || ''), notes: String(item.notes || '') };
}

function normalizeMachine(item = {}) {
  const accessoriesRaw = item.accessories || item.accessoires || [];
  const historyRaw = item.maintenanceHistory || item.maintenance_history || item.entretien || [];
  const consumablesRaw = item.consumableStockIds || item.consumable_stock_ids || item.consumables || [];
  return {
    id: item.id || uid('machine'),
    code: normalizeMachineCode(item.code || item.identifier || item.identifiant || ''),
    name: String(item.name || item.label || 'Machine'),
    category: String(item.category || 'Machine d’atelier'),
    brand: String(item.brand || item.marque || ''),
    model: String(item.model || item.modele || ''),
    serialNumber: String(item.serialNumber || item.serial_number || item.numero_serie || ''),
    location: String(item.location || ''),
    status: String(item.status || item.etat || 'Disponible'),
    purchaseDate: item.purchaseDate || item.purchase_date || item.date_achat || '',
    purchasePrice: Math.max(0, num(item.purchasePrice ?? item.purchase_price ?? item.prix_achat ?? 0)),
    warrantyUntil: item.warrantyUntil || item.warranty_until || item.garantie_jusqu_au || '',
    powerW: Math.max(0, num(item.powerW ?? item.power_w ?? item.puissance_w ?? 0)),
    kerfMm: Math.max(0, num(item.kerfMm ?? item.kerf_mm ?? item.trait_de_coupe_mm ?? 0)),
    capacityMm: Math.max(0, num(item.capacityMm ?? item.capacity_mm ?? item.capacite_mm ?? 0)),
    lastMaintenance: item.lastMaintenance || item.last_maintenance || item.dernier_entretien || '',
    nextMaintenance: item.nextMaintenance || item.next_maintenance || item.prochain_entretien || '',
    maintenanceIntervalDays: Math.max(0, Math.round(num(item.maintenanceIntervalDays ?? item.maintenance_interval_days ?? item.intervalle_entretien_jours ?? 0))),
    manualUrl: String(item.manualUrl || item.manual_url || item.notice_url || ''),
    accessories: Array.isArray(accessoriesRaw) ? accessoriesRaw.map(value => String(value).trim()).filter(Boolean) : String(accessoriesRaw).split(/\n|,/).map(value => value.trim()).filter(Boolean),
    consumableStockIds: Array.isArray(consumablesRaw) ? consumablesRaw.map(value => String(value)) : [],
    maintenanceHistory: Array.isArray(historyRaw) ? historyRaw.map(entry => ({ id: entry.id || uid('maint'), date: entry.date || entry.maintenance_date || '', type: String(entry.type || entry.category || 'Entretien'), cost: Math.max(0, num(entry.cost ?? entry.amount ?? 0)), operatingHours: Math.max(0, num(entry.operatingHours ?? entry.operating_hours ?? 0)), notes: String(entry.notes || ''), nextDue: entry.nextDue || entry.next_due || '' })).sort((a,b) => String(b.date).localeCompare(String(a.date))) : [],
    notes: String(item.notes || '')
  };
}

function normalizeCutJob(job = {}) {
  return {
    id: job.id || uid('cut'),
    name: String(job.name || 'Découpe sans nom'),
    stockId: job.stockId || job.stock_id || null,
    machineId: job.machineId || job.machine_id || null,
    kerfMm: Math.max(0, num(job.kerfMm ?? job.kerf_mm ?? 3)),
    trimMm: Math.max(0, num(job.trimMm ?? job.trim_mm ?? 0)),
    minScrapMm: Math.max(0, num(job.minScrapMm ?? job.min_scrap_mm ?? 250)),
    useCompatibleScraps: job.useCompatibleScraps !== false,
    requests: Array.isArray(job.requests) ? job.requests.map((item,index) => ({ ref: String(item.ref || String.fromCharCode(65+index)), lengthMm: Math.max(0,num(item.lengthMm ?? item.length_mm ?? item.length)), qty: Math.max(1,Math.round(num(item.qty ?? item.quantity ?? 1))), note: String(item.note || '') })) : [],
    plan: job.plan || null,
    status: String(job.status || 'Brouillon'),
    createdAt: job.createdAt || job.created_at || new Date().toISOString(),
    completedAt: job.completedAt || job.completed_at || null
  };
}

function normalizeRequirement(item = {}) {
  const stockType = String(item.stockType || item.stock_type || inferStockType(item)).toLowerCase();
  const requiredLengthMm = Math.max(0, num(item.requiredLengthMm ?? item.required_length_mm ?? item.total_length_mm ?? 0));
  const plannedQty = Math.max(0, num(item.plannedQty ?? item.required_quantity ?? item.quantity ?? item.qty ?? requiredLengthMm));
  return {
    id: item.id || uid('req'),
    name: String(item.name || item.label || item.designation || item.material || 'Matériau'),
    category: String(item.category || inferCategory(item.name || item.material) || 'Autre'),
    material: String(item.material || ''),
    stockType: ['linear','sheet','count','weight','volume','other'].includes(stockType) ? stockType : 'other',
    unit: String(item.unit || (requiredLengthMm ? 'mm' : defaultUnit(stockType))),
    plannedQty,
    requiredLengthMm,
    lengthMm: Math.max(0, num(item.lengthMm ?? item.length_mm ?? item.dimensions?.length_mm ?? 0)),
    widthMm: Math.max(0, num(item.widthMm ?? item.width_mm ?? item.dimensions?.width_mm ?? item.section_mm?.width ?? 0)),
    thicknessMm: Math.max(0, num(item.thicknessMm ?? item.thickness_mm ?? item.dimensions?.thickness_mm ?? item.section_mm?.height ?? 0)),
    color: String(item.color || item.color_name || ''),
    stockId: item.stockId || item.stock_id || null,
    filamentId: item.filamentId || item.filament_id || null,
    reservedQty: Math.max(0, num(item.reservedQty ?? item.reserved_quantity ?? 0)),
    reservationUnit: String(item.reservationUnit || item.reservation_unit || ''),
    notes: String(item.notes || '')
  };
}

function normalizeProject(project = {}) {
  const dimensions = project.dimensions_mm || project.dimensions || {};
  const pieces = Array.isArray(project.pieces) ? project.pieces.map((piece, index) => ({
    id: piece.id || uid('piece'), ref: String(piece.ref || piece.reference || String.fromCharCode(65 + index)), name: String(piece.name || piece.label || 'Pièce'),
    type: String(piece.type || piece.manufacturing_method || inferPieceType(piece)), material: String(piece.material || ''),
    length: Math.max(0, num(piece.length ?? piece.length_mm ?? piece.dimensions?.length_mm ?? 0)), width: Math.max(0, num(piece.width ?? piece.width_mm ?? piece.dimensions?.width_mm ?? 0)), thickness: Math.max(0, num(piece.thickness ?? piece.thickness_mm ?? piece.dimensions?.thickness_mm ?? 0)),
    qty: Math.max(1, Math.round(num(piece.qty ?? piece.quantity ?? 1))), status: String(piece.status || 'À fabriquer'), unitCost: Math.max(0, num(piece.unitCost ?? piece.unit_cost ?? 0))
  })) : [];
  const cuts = Array.isArray(project.cuts) ? project.cuts : [];
  cuts.forEach((cut, index) => {
    pieces.push({ id: uid('piece'), ref: String(cut.ref || cut.reference || `D${index + 1}`), name: String(cut.name || cut.label || 'Découpe'), type: 'Découpe bois', material: String(cut.material || project.material || ''), length: Math.max(0, num(cut.length_mm ?? cut.length ?? 0)), width: Math.max(0, num(cut.width_mm ?? cut.width ?? 0)), thickness: Math.max(0, num(cut.thickness_mm ?? cut.thickness ?? 0)), qty: Math.max(1, Math.round(num(cut.quantity ?? cut.qty ?? 1))), status: 'À fabriquer', unitCost: 0 });
  });
  const prints = Array.isArray(project.prints || project.print_jobs) ? (project.prints || project.print_jobs).map(print => ({
    id: print.id || uid('print'), name: String(print.name || print.label || 'Pièce imprimée'), qty: Math.max(1, Math.round(num(print.qty ?? print.quantity ?? 1))),
    material: String(print.material || print.filament_material || 'PLA').toUpperCase(), color: String(print.color || print.color_name || ''), filamentId: print.filamentId || print.filament_id || null,
    weight: Math.max(0, num(print.weight ?? print.weight_g ?? print.total_weight_g ?? 0)), duration: Math.max(0, num(print.duration ?? print.duration_hours ?? 0)), status: String(print.status || 'À imprimer')
  })) : [];
  const stepsRaw = project.steps || project.assembly_steps || [];
  const steps = Array.isArray(stepsRaw) ? stepsRaw.map(step => ({ id: step.id || uid('step'), title: String(step.title || step.name || 'Étape'), description: String(step.description || step.instructions || ''), done: Boolean(step.done) })) : [];
  const expensesRaw = project.expenses || project.budget_items || [];
  const expenses = Array.isArray(expensesRaw) ? expensesRaw.map(item => ({ id: item.id || uid('expense'), label: String(item.label || item.name || 'Dépense'), category: String(item.category || 'Autre'), amount: Math.max(0, num(item.amount ?? item.cost ?? 0)) })) : [];
  let requirements = Array.isArray(project.requirements) ? project.requirements.map(normalizeRequirement) : [];
  if (!requirements.length && Array.isArray(project.materials)) requirements = project.materials.map(normalizeRequirement);
  prints.forEach(print => {
    if (!print.weight) return;
    const exists = requirements.some(req => req.stockType === 'weight' && normalizeText(req.name + req.material).includes(normalizeText(print.material)));
    if (!exists) requirements.push(normalizeRequirement({ name: `${print.material}${print.color ? ` ${print.color}` : ''}`, category: 'Filament', stock_type: 'weight', unit: 'g', required_quantity: print.weight, material: print.material, color: print.color }));
  });
  return {
    id: project.id || uid('project'), name: String(project.name || project.title || 'Nouveau projet'), category: String(project.category || project.type || 'Projet'), description: String(project.description || project.summary || ''),
    icon: String(project.icon || '🛠️'), status: STATUS_OPTIONS.includes(project.status) ? project.status : 'En préparation',
    width: Math.max(0, num(project.width ?? project.width_mm ?? dimensions.width_mm ?? dimensions.width ?? 0)), depth: Math.max(0, num(project.depth ?? project.depth_mm ?? dimensions.depth_mm ?? dimensions.depth ?? 0)), height: Math.max(0, num(project.height ?? project.height_mm ?? dimensions.height_mm ?? dimensions.height ?? dimensions.rear_height_mm ?? 0)),
    createdAt: project.createdAt || project.created_at || new Date().toISOString(), updatedAt: project.updatedAt || project.updated_at || new Date().toISOString(), completedAt: project.completedAt || project.completed_at || null,
    pieces, stockBars: Array.isArray(project.stockBars || project.stock_bars) ? (project.stockBars || project.stock_bars).map(bar => ({ id: bar.id || uid('bar'), sourceStockId: bar.sourceStockId || bar.source_stock_id || null, label: String(bar.label || bar.name || 'Barre'), length: Math.max(0, num(bar.length ?? bar.length_mm ?? 0)), qty: Math.max(1, Math.round(num(bar.qty ?? bar.quantity ?? 1))), kerf: Math.max(0, num(bar.kerf ?? bar.kerf_mm ?? 3)) })) : [], cutPlan: null,
    prints, steps, expenses, requirements, actualConsumption: Array.isArray(project.actualConsumption) ? project.actualConsumption : []
  };
}


function normalizeMapMarker(item = {}) {
  return {
    id: item.id || uid('map'),
    name: String(item.name || item.label || item.location || 'Repère'),
    location: String(item.location || item.locationPath || item.path || ''),
    type: ['zone','storage','machine','tool','stock','other'].includes(item.type) ? item.type : 'storage',
    xPct: clamp(num(item.xPct ?? item.x_pct ?? item.x ?? 5), 0, 95),
    yPct: clamp(num(item.yPct ?? item.y_pct ?? item.y ?? 5), 0, 95),
    widthPct: clamp(num(item.widthPct ?? item.width_pct ?? item.width ?? 22), 6, 90),
    heightPct: clamp(num(item.heightPct ?? item.height_pct ?? item.height ?? 18), 6, 90),
    notes: String(item.notes || '')
  };
}
function normalizeWorkshopMap(value = {}) {
  const markers = Array.isArray(value.markers) ? value.markers.map(normalizeMapMarker) : [];
  return {
    name: String(value.name || 'Atelier principal'),
    widthMm: Math.max(0, num(value.widthMm ?? value.width_mm ?? 0)),
    depthMm: Math.max(0, num(value.depthMm ?? value.depth_mm ?? 0)),
    backgroundImage: String(value.backgroundImage || value.background_image || ''),
    markers
  };
}

function migrateState(saved) {
  const base = emptyState();
  const source = saved || {};
  const inventorySource = Array.isArray(source.inventory) ? source.inventory : (Array.isArray(source.stock) ? source.stock : []);
  const migrated = {
    ...base, ...source,
    settings: { ...base.settings, ...(source.settings || {}) },
    projects: Array.isArray(source.projects) ? source.projects.map(normalizeProject) : [],
    inventory: inventorySource.map(normalizeInventoryItem),
    filaments: Array.isArray(source.filaments) ? source.filaments.map(normalizeFilament) : [],
    tools: Array.isArray(source.tools) ? source.tools.map(normalizeTool) : [],
    machines: Array.isArray(source.machines) ? source.machines.map(normalizeMachine) : [],
    cutJobs: Array.isArray(source.cutJobs || source.cut_jobs) ? (source.cutJobs || source.cut_jobs).map(normalizeCutJob) : [],
    movements: Array.isArray(source.movements) ? source.movements : [],
    workshopMap: normalizeWorkshopMap(source.workshopMap || source.workshop_map || {}),
    ui: { ...base.ui, ...(source.ui || {}) },
    meta: { ...base.meta, ...(source.meta || {}), version: APP_VERSION }
  };
  if (['create','workshop'].includes(migrated.ui.route)) migrated.ui.route = 'home';
  if (migrated.ui.route === 'atelier' && ['machines','tools'].includes(migrated.ui.atelierTab)) {
    migrated.ui.route = 'equipment';
    migrated.ui.equipmentTab = migrated.ui.atelierTab;
    migrated.ui.atelierTab = 'plan';
  }
  if (!['machines','tools'].includes(migrated.ui.equipmentTab)) migrated.ui.equipmentTab = 'machines';
  if (!['plan','locations','more'].includes(migrated.ui.atelierTab)) migrated.ui.atelierTab = 'plan';
  ensureFilamentCodes(migrated.filaments);
  ensureMachineCodes(migrated.machines);
  return migrated;
}

async function loadState() {
  try {
    db = await openDb();
    const saved = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get('state');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (saved) { state = migrateState(saved); state.projects.forEach(project => rematchProjectRequirements(project, true)); }
  } catch (error) {
    try {
      const saved = localStorage.getItem('atelier20-state');
      if (saved) { state = migrateState(JSON.parse(saved)); state.projects.forEach(project => rematchProjectRequirements(project, true)); }
    } catch (storageError) { console.warn(storageError); }
  }
}

async function saveState() {
  state.meta.updatedAt = new Date().toISOString();
  state.meta.version = APP_VERSION;
  try {
    if (!db) db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(state, 'state');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    try { localStorage.setItem('atelier20-state', JSON.stringify(state)); } catch (storageError) { console.warn(storageError); }
  }
}

function toast(message) {
  const region = $('#toastRegion');
  if (!region) return;
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = message; region.append(el); setTimeout(() => el.remove(), 2700);
}

function navigate(route, options = {}) {
  if (route === 'create') return openCreateChooser();
  state.ui.route = route;
  if (options.projectId) state.ui.selectedProjectId = options.projectId;
  if (options.projectTab) state.ui.projectTab = options.projectTab;
  if (options.workshopTab) state.ui.workshopTab = options.workshopTab;
  if (options.equipmentTab) state.ui.equipmentTab = options.equipmentTab;
  if (options.atelierTab) state.ui.atelierTab = options.atelierTab;
  if (options.cutTab) state.ui.cutTab = options.cutTab;
  saveState(); render(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function buildNavigation() {
  const item = (route, label) => `<button type="button" class="nav-item ${route.create ? 'create' : ''} ${state.ui.route === route.id ? 'active' : ''}" data-route="${route.id}"><span class="nav-icon">${route.icon}</span><span>${label}</span></button>`;
  $('#bottomNav').innerHTML = routes.map(route => item(route, route.mobileLabel || route.label)).join('');
  $('#sidebarNav').innerHTML = routes.map(route => item(route, route.label)).join('');
  $$('.nav-item').forEach(button => button.addEventListener('click', () => navigate(button.dataset.route)));
}

function render() {
  buildNavigation();
  const renderers = {
    home: renderHome,
    inventory: renderInventoryPage,
    cuts: renderCuts,
    filaments: renderFilamentsPage,
    equipment: renderEquipmentPage,
    atelier: renderAtelierPage,
    projects: renderProjects,
    project: renderProjectDetail,
    imports: renderImports,
    workshop: renderWorkshop,
    more: renderMore,
    settings: renderSettings
  };
  $('#mainContent').innerHTML = (renderers[state.ui.route] || renderHome)();
  bindPageEvents();
}

function pageHead(title, subtitle, actions = '') {
  return `<div class="page-head"><div><h1 class="page-title">${escapeHtml(title)}</h1><p class="page-subtitle">${escapeHtml(subtitle)}</p></div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
}

function emptyCard(title, text, button = '', action = '') {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong>${escapeHtml(text)}${button ? `<div class="card-actions" style="justify-content:center"><button class="btn btn-small btn-primary" data-action="${action}">${escapeHtml(button)}</button></div>` : ''}</div>`;
}

function selectedProject() { return state.projects.find(project => project.id === state.ui.selectedProjectId) || state.projects[0] || null; }
function stockAvailable(item) { return Math.max(0, num(item.quantity) - num(item.reserved)); }
function filamentAvailable(item) { return Math.max(0, num(item.remainingWeight) - num(item.reservedWeight)); }
function projectProgress(project) { const total = project.steps?.length || 0; return total ? Math.round((project.steps.filter(step => step.done).length / total) * 100) : 0; }
function projectBudget(project) { return (project.expenses || []).reduce((sum, item) => sum + num(item.amount), 0) + (project.pieces || []).reduce((sum, item) => sum + num(item.unitCost) * num(item.qty), 0); }

function defaultUnit(type) { return ({ linear: 'barre', sheet: 'panneau', count: 'pièce', weight: 'g', volume: 'ml', other: 'unité' })[type] || 'unité'; }
function inferStockType(item = {}) {
  const text = normalizeText(`${item.name || ''} ${item.material || ''} ${item.unit || ''}`);
  if (item.required_length_mm || item.length_mm || /tasseau|barre|tube|profile|planche/.test(text)) return 'linear';
  if (/panneau|plaque|contreplaque|mdf|osb|tole/.test(text)) return 'sheet';
  if (/filament|bobine|gramme|\bg\b|kg/.test(text)) return 'weight';
  if (/peinture|colle|vernis|huile|ml|litre/.test(text)) return 'volume';
  return 'count';
}
function inferCategory(text = '') {
  const t = normalizeText(text);
  if (/filament|pla|petg|abs|asa|tpu/.test(t)) return 'Filament';
  if (/tasseau|bois|sapin|chene|contreplaque|mdf|osb|planche/.test(t)) return /panneau|contreplaque|mdf|osb/.test(t) ? 'Panneaux' : 'Bois';
  if (/vis|ecrou|boulon|rondelle|charniere|insert|equerre/.test(t)) return 'Quincaillerie';
  if (/cable|prise|interrupteur|led|electrique/.test(t)) return 'Électricité';
  if (/peinture|colle|vernis|huile/.test(t)) return 'Peinture et colle';
  if (/acier|alu|metal|tube|profile/.test(t)) return 'Métal';
  return 'Autre';
}
function inferPieceType(piece = {}) { const text = normalizeText(`${piece.type || ''} ${piece.material || ''} ${piece.name || ''}`); return /3d|imprim|stl|petg|pla/.test(text) ? 'Impression 3D' : 'Découpe bois'; }
function formatDimensions(item) {
  const values = [];
  if (num(item.lengthMm)) values.push(`${integer(item.lengthMm)} mm`);
  if (num(item.widthMm)) values.push(`${integer(item.widthMm)} mm`);
  if (num(item.thicknessMm)) values.push(`${integer(item.thicknessMm)} mm`);
  return values.length ? values.join(' × ') : 'Dimensions non précisées';
}
function formatQty(value, unit) { return `${decimal(value)} ${escapeHtml(unit || '')}`.trim(); }
function requirementPlannedLabel(req) { return req.requiredLengthMm ? `${decimal(req.requiredLengthMm / 1000)} m nécessaires` : formatQty(req.plannedQty, req.unit); }
function requirementReservedLabel(req) { return req.reservedQty ? formatQty(req.reservedQty, req.reservationUnit || req.unit) : '0'; }

function inventorySignature(item) {
  return [normalizeText(item.name), normalizeText(item.material), item.stockType, num(item.lengthMm), num(item.widthMm), num(item.thicknessMm), normalizeText(item.unit)].join('|');
}
function filamentSignature(item) { return [normalizeText(item.brand), normalizeText(item.range), normalizeText(item.material), normalizeText(item.colorName)].join('|'); }
function toolSignature(item) { return [normalizeText(item.name), normalizeText(item.category)].join('|'); }

function requirementMatchScore(req, item) {
  let score = 0;
  const reqText = normalizeText(`${req.name} ${req.material}`);
  const itemText = normalizeText(`${item.name} ${item.material}`);
  if (!reqText || !itemText) return 0;
  if (reqText === itemText) score += 80;
  else {
    const reqTokens = new Set(reqText.split(' ').filter(token => token.length > 1));
    const itemTokens = new Set(itemText.split(' ').filter(token => token.length > 1));
    const common = [...reqTokens].filter(token => itemTokens.has(token)).length;
    score += common * 9;
    if (itemText.includes(reqText) || reqText.includes(itemText)) score += 25;
  }
  if (req.stockType === item.stockType) score += 15;
  if (req.category === item.category) score += 8;
  if (req.widthMm && item.widthMm && Math.abs(req.widthMm - item.widthMm) <= 1) score += 12;
  if (req.thicknessMm && item.thicknessMm && Math.abs(req.thicknessMm - item.thicknessMm) <= 1) score += 12;
  if (req.lengthMm && item.lengthMm && Math.abs(req.lengthMm - item.lengthMm) <= 2) score += 8;
  return score;
}

function filamentMatchScore(req, filament) {
  const reqText = normalizeText(`${req.name} ${req.material} ${req.color}`);
  const filText = normalizeText(`${filament.material} ${filament.colorName} ${filament.brand} ${filament.range}`);
  const tokens = reqText.split(' ').filter(token => token.length > 1);
  let score = tokens.filter(token => filText.includes(token)).length * 12;
  if (normalizeText(req.material) === normalizeText(filament.material)) score += 35;
  if (req.color && normalizeText(req.color) === normalizeText(filament.colorName)) score += 25;
  return score;
}

function findBestInventoryMatch(req) {
  let best = null; let bestScore = 0;
  state.inventory.forEach(item => {
    const score = requirementMatchScore(req, item);
    if (score > bestScore) { best = item; bestScore = score; }
  });
  return bestScore >= 25 ? best : null;
}

function findBestFilamentMatch(req) {
  let best = null; let bestScore = 0;
  state.filaments.forEach(item => {
    const score = filamentMatchScore(req, item);
    if (score > bestScore) { best = item; bestScore = score; }
  });
  return bestScore >= 25 ? best : null;
}

function rematchProjectRequirements(project, preserveReservation = true) {
  (project.requirements || []).forEach(req => {
    if (preserveReservation && req.reservedQty > 0) return;
    const isFilament = req.category === 'Filament' || req.stockType === 'weight' && /pla|petg|abs|asa|tpu|filament/i.test(`${req.name} ${req.material}`);
    if (isFilament) {
      const filament = req.filamentId ? state.filaments.find(item => item.id === req.filamentId) : findBestFilamentMatch(req);
      req.filamentId = filament?.id || null; req.stockId = null;
    } else {
      const item = req.stockId ? state.inventory.find(stock => stock.id === req.stockId) : findBestInventoryMatch(req);
      req.stockId = item?.id || null; req.filamentId = null;
    }
  });
  loadProjectBarsFromMatches(project, false);
}

function plannedReservation(req, source) {
  if (!source) return 0;
  if (req.filamentId) return Math.max(0, num(req.plannedQty));
  if (source.stockType === 'linear' && req.requiredLengthMm && source.lengthMm) return Math.max(1, Math.ceil(req.requiredLengthMm / source.lengthMm));
  if (source.stockType === 'sheet' && req.plannedQty) return Math.ceil(req.plannedQty);
  return Math.max(0, num(req.plannedQty));
}

function reserveProjectStock(project, showToast = true) {
  rematchProjectRequirements(project, true);
  let reservedLines = 0; let missingLines = 0;
  (project.requirements || []).forEach(req => {
    if (req.filamentId) {
      const filament = state.filaments.find(item => item.id === req.filamentId);
      if (!filament) { missingLines++; return; }
      const planned = plannedReservation(req, filament);
      const missing = Math.max(0, planned - num(req.reservedQty));
      const amount = Math.min(missing, filamentAvailable(filament));
      filament.reservedWeight += amount; req.reservedQty += amount; req.reservationUnit = 'g';
      if (amount > 0) { reservedLines++; addMovement('reservation', 'filament', filament.id, amount, 'g', project.id, `Réservation pour ${project.name}`); }
      if (req.reservedQty < planned) missingLines++;
      return;
    }
    const item = state.inventory.find(stock => stock.id === req.stockId);
    if (!item) { missingLines++; return; }
    const planned = plannedReservation(req, item);
    const missing = Math.max(0, planned - num(req.reservedQty));
    const amount = Math.min(missing, stockAvailable(item));
    item.reserved += amount; req.reservedQty += amount; req.reservationUnit = item.unit;
    if (amount > 0) { reservedLines++; addMovement('reservation', 'inventory', item.id, amount, item.unit, project.id, `Réservation pour ${project.name}`); }
    if (req.reservedQty < planned) missingLines++;
  });
  loadProjectBarsFromMatches(project, true);
  project.updatedAt = new Date().toISOString();
  if (showToast) toast(missingLines ? `Stock réservé partiellement : ${missingLines} besoin(s) incomplet(s).` : `${reservedLines} ligne(s) de stock réservée(s).`);
}

function releaseProjectStock(project, showToast = true) {
  let released = 0;
  (project.requirements || []).forEach(req => {
    if (!req.reservedQty) return;
    if (req.filamentId) {
      const filament = state.filaments.find(item => item.id === req.filamentId);
      if (filament) { filament.reservedWeight = Math.max(0, filament.reservedWeight - req.reservedQty); addMovement('release', 'filament', filament.id, req.reservedQty, 'g', project.id, `Libération pour ${project.name}`); }
    } else {
      const item = state.inventory.find(stock => stock.id === req.stockId);
      if (item) { item.reserved = Math.max(0, item.reserved - req.reservedQty); addMovement('release', 'inventory', item.id, req.reservedQty, item.unit, project.id, `Libération pour ${project.name}`); }
    }
    req.reservedQty = 0; req.reservationUnit = ''; released++;
  });
  project.updatedAt = new Date().toISOString();
  if (showToast) toast(`${released} réservation(s) libérée(s).`);
}

function addMovement(type, sourceType, sourceId, quantity, unit, projectId = null, note = '') {
  state.movements.unshift({ id: uid('movement'), type, sourceType, sourceId, quantity: num(quantity), unit: unit || '', projectId, note, createdAt: new Date().toISOString() });
  state.movements = state.movements.slice(0, 500);
}

function loadProjectBarsFromMatches(project, onlyReserved = false) {
  const bars = [];
  (project.requirements || []).forEach(req => {
    if (!req.stockId) return;
    const stock = state.inventory.find(item => item.id === req.stockId);
    if (!stock || stock.stockType !== 'linear' || !stock.lengthMm) return;
    const qty = onlyReserved && req.reservedQty ? req.reservedQty : Math.min(stockAvailable(stock) + num(req.reservedQty), plannedReservation(req, stock));
    if (!qty) return;
    bars.push({ id: uid('bar'), sourceStockId: stock.id, label: stock.name, length: stock.lengthMm, qty: Math.max(1, Math.round(qty)), kerf: 3 });
  });
  if (bars.length) { project.stockBars = bars; project.cutPlan = null; }
}

function renderHome() {
  const lowItems = state.inventory.filter(item => num(item.lowThreshold) > 0 && stockAvailable(item) <= num(item.lowThreshold));
  const lowFilaments = state.filaments.filter(item => filamentAvailable(item) < 200);
  const scraps = state.inventory.filter(item => item.stockType === 'linear' && item.isScrap && stockAvailable(item) > 0);
  const recentCuts = [...state.cutJobs].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0,3);
  const locations = uniqueLocations();
  const maintenanceMachines = state.machines.filter(machine => ['overdue','today','soon'].includes(machineMaintenanceInfo(machine).key));
  return `
    <section class="hero">
      <h1>Tout votre atelier, facile à retrouver et à découper.</h1>
      <p>Suivez les matériaux, les bobines, les machines et leur emplacement sur le plan de l’atelier. Préparez une découpe en quelques secondes, sans créer de projet.</p>
      <div class="actions"><button class="btn btn-primary" data-action="new-linear-cut">✂ Nouvelle découpe</button><button class="btn btn-outline" data-action="add-stock" style="color:white;border-color:rgba(255,255,255,.5)">＋ Ajouter au stock</button></div>
    </section>
    <section class="metric-grid">
      <article class="metric-card"><span class="metric-label">Références en stock</span><strong class="metric-value">${state.inventory.length}</strong><div class="metric-note">${scraps.length} chute(s) suivie(s)</div></article>
      <article class="metric-card"><span class="metric-label">Bobines</span><strong class="metric-value">${state.filaments.length}</strong><div class="metric-note">${lowFilaments.length} sous 200 g</div></article>
      <article class="metric-card"><span class="metric-label">Machines</span><strong class="metric-value">${state.machines.length}</strong><div class="metric-note">${state.machines.filter(m => m.status === 'Disponible').length} disponible(s) • ${maintenanceMachines.length} entretien(s)</div></article>
      <article class="metric-card"><span class="metric-label">Emplacements</span><strong class="metric-value">${locations.length}</strong><div class="metric-note">Zones et rangements recensés</div></article>
    </section>
    <section class="section"><div class="section-title-row"><h2 class="section-title">Actions rapides</h2></div><div class="quick-actions">
      <button class="btn btn-secondary quick-action" data-action="new-linear-cut"><strong>✂ Découper</strong><span>Optimiser des barres ou des chutes</span></button>
      <button class="btn btn-outline quick-action" data-action="scan-filament"><strong>⌁ Scanner</strong><span>Ouvrir une bobine par QR code</span></button>
      <button class="btn btn-outline quick-action" data-action="import-inventory"><strong>⬆ Inventaire</strong><span>Importer un fichier Atelier 2.0</span></button>
      <button class="btn btn-outline quick-action" data-route-direct="atelier"><strong>⌖ Plan atelier</strong><span>Retrouver un outil ou un stock</span></button>
    </div></section>
    <section class="section"><div class="section-title-row"><h2 class="section-title">Alertes</h2><button class="btn btn-small btn-outline" data-route-direct="inventory">Voir le stock</button></div>
      <div class="list">${[...maintenanceMachines.map(machine => { const info = machineMaintenanceInfo(machine); return `<div class="list-row"><div><strong>${escapeHtml(machine.code)} — ${escapeHtml(machine.name)}</strong><div class="small">Entretien ${escapeHtml(info.label.toLowerCase())} • ${escapeHtml(machine.location || 'Emplacement non défini')}</div></div><button class="btn btn-small btn-outline" data-machine-quick="${machine.id}">Ouvrir</button></div>`; }), ...lowItems.map(item => `<div class="list-row"><div><strong>${escapeHtml(item.name)}</strong><div class="small">Disponible : ${decimal(stockAvailable(item))} ${escapeHtml(item.unit)} • ${escapeHtml(item.location || 'Emplacement non défini')}</div></div><span class="badge danger">Stock faible</span></div>`), ...lowFilaments.map(item => `<div class="list-row"><div><strong>${escapeHtml(item.code)} — ${escapeHtml(item.material)} ${escapeHtml(item.colorName)}</strong><div class="small">${decimal(filamentAvailable(item))} g disponibles • ${escapeHtml(item.location || 'Emplacement non défini')}</div></div><button class="btn btn-small btn-outline" data-filament-quick="${item.id}">Ouvrir</button></div>`)].join('') || '<div class="empty-state"><strong>Aucune alerte</strong>Les seuils et entretiens sont à jour.</div>'}</div>
    </section>
    <section class="section"><div class="section-title-row"><h2 class="section-title">Dernières découpes</h2><button class="btn btn-small btn-outline" data-route-direct="cuts">Tout voir</button></div><div class="card-grid">${recentCuts.length ? recentCuts.map(cutJobCard).join('') : emptyCard('Aucune découpe', 'Créez un plan de coupe directement depuis le stock.', 'Nouvelle découpe', 'new-linear-cut')}</div></section>`;
}

function projectCard(project) {
  const progress = projectProgress(project);
  const matched = (project.requirements || []).filter(req => req.stockId || req.filamentId).length;
  const total = (project.requirements || []).length;
  return `<article class="card project-card"><div class="project-thumb">${escapeHtml(project.icon || '🛠️')}</div><div><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><h3>${escapeHtml(project.name)}</h3><span class="badge ${project.status === 'Terminé' ? 'success' : project.status === 'En fabrication' ? 'amber' : ''}">${escapeHtml(project.status)}</span></div><div class="meta">${escapeHtml(project.category)} • ${total ? `${matched}/${total} besoins rapprochés` : 'Aucun besoin saisi'}</div><div class="progress"><span style="width:${progress}%"></span></div><div class="card-actions"><button class="btn btn-small btn-secondary" data-open-project="${project.id}">Ouvrir</button><button class="btn btn-small btn-ghost" data-project-menu="${project.id}">•••</button></div></div></article>`;
}

function renderProjects() {
  return `${pageHead('Mes projets', 'Projets importés, fabrications en cours et archives.', '<button class="btn btn-outline" data-action="import-project">⬆ Importer</button><button class="btn btn-primary" data-action="manual-project">＋ Manuel</button>')}
    <div class="card" style="margin-bottom:16px"><div class="form-grid two"><div class="field"><label for="projectSearch">Rechercher</label><input id="projectSearch" class="input" placeholder="Nom, matériau, catégorie…"></div><div class="field"><label for="projectFilter">Statut</label><select id="projectFilter" class="select"><option value="">Tous</option>${STATUS_OPTIONS.map(status => `<option>${status}</option>`).join('')}</select></div></div></div>
    <div id="projectList" class="card-grid">${state.projects.length ? state.projects.map(projectCard).join('') : emptyCard('Aucun projet', 'Votre atelier numérique est prêt.', 'Importer un projet', 'import-project')}</div>`;
}

function renderProjectDetail() {
  const project = selectedProject();
  if (!project) return renderProjects();
  const tabs = [['summary','Résumé'],['needs','Besoins'],['pieces','Pièces'],['cuts','Découpes'],['prints','3D'],['steps','Montage'],['budget','Budget']];
  const actions = `<button class="btn btn-outline" data-action="export-project">Exporter</button><button class="btn btn-primary" data-action="edit-project">Modifier</button>`;
  return `${pageHead(project.name, `${project.category} • Modifié le ${dateFr(project.updatedAt)}`, actions)}
    <div class="tabs" role="tablist">${tabs.map(([id,label]) => `<button class="tab ${state.ui.projectTab === id ? 'active' : ''}" data-project-tab="${id}">${label}</button>`).join('')}</div>
    <div id="projectTabContent">${renderProjectTab(project, state.ui.projectTab)}</div>`;
}

function renderProjectTab(project, tab) {
  if (tab === 'needs') return renderProjectNeeds(project);
  if (tab === 'pieces') return renderProjectPieces(project);
  if (tab === 'cuts') return renderProjectCuts(project);
  if (tab === 'prints') return renderProjectPrints(project);
  if (tab === 'steps') return renderProjectSteps(project);
  if (tab === 'budget') return renderProjectBudget(project);
  return renderProjectSummary(project);
}

function renderProjectSummary(project) {
  const progress = projectProgress(project);
  const nextStep = (project.steps || []).find(step => !step.done);
  const requirements = project.requirements || [];
  const matched = requirements.filter(req => req.stockId || req.filamentId).length;
  const reserved = requirements.filter(req => req.reservedQty > 0).length;
  const missing = requirements.filter(req => !(req.stockId || req.filamentId)).length;
  return `<div class="summary-grid">
    <section class="card"><div style="display:flex;gap:16px;align-items:center"><div class="project-thumb" style="width:96px;height:96px;font-size:2.5rem">${escapeHtml(project.icon || '🛠️')}</div><div><span class="badge ${project.status === 'Terminé' ? 'success' : 'amber'}">${escapeHtml(project.status)}</span><h2 style="margin:8px 0 4px">${escapeHtml(project.name)}</h2><div class="meta">${escapeHtml(project.description || 'Aucune description')}</div></div></div>
      <div class="progress" style="margin-top:20px"><span style="width:${progress}%"></span></div><div class="small" style="margin-top:7px">Progression du montage : ${progress}%</div>
      <hr><div class="kv-grid"><div class="kv"><span>Dimensions</span><strong>${integer(project.width)} × ${integer(project.depth)} × ${integer(project.height)} mm</strong></div><div class="kv"><span>Pièces</span><strong>${(project.pieces || []).reduce((sum,item) => sum + num(item.qty), 0)}</strong></div><div class="kv"><span>Besoins rapprochés</span><strong>${matched}/${requirements.length}</strong></div><div class="kv"><span>Budget saisi</span><strong>${money(projectBudget(project))}</strong></div></div>
      <div class="status-flow">${STATUS_OPTIONS.map(status => `<button class="status-chip ${project.status === status ? 'active' : ''}" data-set-project-status="${escapeHtml(status)}">${escapeHtml(status)}</button>`).join('')}</div>
    </section>
    <section>
      ${project.status === 'Terminé' ? `<div class="card success-banner"><strong>Projet terminé le ${dateFr(project.completedAt)}</strong><div class="small">Les consommations réelles ont été déduites du stock.</div><button class="btn btn-small btn-outline" style="margin-top:10px" data-action="view-consumption">Voir le détail</button></div>` : `<div class="card ai-panel"><span class="badge">Prochaine action</span><h3>${escapeHtml(nextStep?.title || 'Préparer le stock')}</h3><p class="meta">${escapeHtml(nextStep?.description || 'Vérifiez les besoins et réservez les matériaux disponibles.')}</p><div class="card-actions"><button class="btn btn-small btn-secondary" data-project-tab-direct="${nextStep ? 'steps' : 'needs'}">Ouvrir</button></div></div>`}
      <div class="card" style="margin-top:14px"><h3 style="margin-top:0">Stock du projet</h3><div class="kv-grid"><div class="kv"><span>Réservations</span><strong>${reserved}</strong></div><div class="kv"><span>Besoins manquants</span><strong>${missing}</strong></div><div class="kv"><span>Découpes</span><strong>${(project.pieces || []).filter(item => item.type === 'Découpe bois').length}</strong></div><div class="kv"><span>Impressions 3D</span><strong>${(project.prints || []).length}</strong></div></div><div class="card-actions">${project.status !== 'Terminé' ? `<button class="btn btn-small btn-primary" data-action="complete-project">Terminer le projet</button>` : ''}<button class="btn btn-small btn-ghost" data-project-tab-direct="needs">Gérer le stock</button></div></div>
    </section>
  </div>`;
}

function requirementSource(req) {
  if (req.filamentId) return { type: 'filament', item: state.filaments.find(item => item.id === req.filamentId) || null };
  if (req.stockId) return { type: 'inventory', item: state.inventory.find(item => item.id === req.stockId) || null };
  return { type: null, item: null };
}

function requirementMatchHtml(req) {
  const source = requirementSource(req);
  if (!source.item) return `<div class="requirement-match missing"><strong>Aucun stock rapproché</strong><div>Cette ligne restera dans la liste d’achats.</div></div>`;
  if (source.type === 'filament') return `<div class="requirement-match"><strong>${escapeHtml(source.item.material)} ${escapeHtml(source.item.colorName)}</strong><div>${decimal(filamentAvailable(source.item))} g disponibles • ${decimal(source.item.reservedWeight)} g réservés au total</div></div>`;
  return `<div class="requirement-match"><strong>${escapeHtml(source.item.name)}</strong><div>${decimal(stockAvailable(source.item))} ${escapeHtml(source.item.unit)} disponibles • ${decimal(source.item.reserved)} réservés au total</div></div>`;
}

function renderProjectNeeds(project) {
  const requirements = project.requirements || [];
  const unmatched = requirements.filter(req => !(req.stockId || req.filamentId)).length;
  const canReserve = project.status !== 'Terminé' && requirements.some(req => req.reservedQty <= 0);
  const canRelease = project.status !== 'Terminé' && requirements.some(req => req.reservedQty > 0);
  return `<div class="section-title-row"><h2 class="section-title">Besoins et réservations</h2><div class="actions"><button class="btn btn-small btn-outline" data-action="add-requirement">＋ Besoin</button><button class="btn btn-small btn-outline" data-action="rematch-stock">Rapprocher</button>${canReserve ? '<button class="btn btn-small btn-primary" data-action="reserve-stock">Réserver</button>' : ''}${canRelease ? '<button class="btn btn-small btn-danger" data-action="release-stock">Libérer</button>' : ''}</div></div>
    ${unmatched ? `<div class="danger-banner" style="margin-bottom:14px"><strong>${unmatched} besoin(s) sans correspondance</strong><div class="small">Importez ou ajoutez l’inventaire manquant, puis relancez le rapprochement.</div></div>` : '<div class="success-banner" style="margin-bottom:14px"><strong>Tous les besoins sont rapprochés</strong><div class="small">Vous pouvez réserver le stock avant de commencer.</div></div>'}
    <div class="card-grid">${requirements.length ? requirements.map(req => `<article class="card requirement-card"><div class="requirement-head"><div><span class="badge">${escapeHtml(req.category)}</span><h3 style="margin:8px 0 4px">${escapeHtml(req.name)}</h3><div class="meta">Prévu : ${requirementPlannedLabel(req)}</div></div><span class="unit-pill">Réservé : ${requirementReservedLabel(req)}</span></div>${requirementMatchHtml(req)}<div class="card-actions"><button class="btn btn-small btn-ghost" data-edit-requirement="${req.id}">Modifier</button><button class="btn btn-small btn-danger" data-delete-requirement="${req.id}">Supprimer</button></div></article>`).join('') : emptyCard('Aucun besoin', 'Les matériaux importés ou saisis apparaîtront ici.', 'Ajouter un besoin', 'add-requirement')}</div>`;
}

function renderProjectPieces(project) {
  return `<div class="section-title-row"><h2 class="section-title">Nomenclature</h2><button class="btn btn-primary btn-small" data-action="add-piece">＋ Ajouter une pièce</button></div><div class="list">${(project.pieces || []).length ? project.pieces.map(piece => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${escapeHtml(piece.ref)} — ${escapeHtml(piece.name)}</div><div class="list-row-sub">${escapeHtml(piece.material)} • ${integer(piece.length)} × ${integer(piece.width)} × ${integer(piece.thickness)} mm • Qté ${integer(piece.qty)}</div></div><div class="actions"><span class="badge">${escapeHtml(piece.status)}</span><button class="btn btn-small btn-ghost" data-edit-piece="${piece.id}">Modifier</button></div></div>`).join('') : '<div class="empty-state"><strong>Aucune pièce</strong>Ajoutez les éléments nécessaires à la fabrication.</div>'}</div>`;
}

function renderProjectCuts(project) {
  const woodPieces = (project.pieces || []).filter(piece => piece.type === 'Découpe bois' && num(piece.length) > 0);
  return `<div class="section-title-row"><h2 class="section-title">Optimisation des barres</h2><div class="actions"><button class="btn btn-small btn-outline" data-action="load-stock-bars">Charger le stock rapproché</button><button class="btn btn-small btn-outline" data-action="add-stock-bar">＋ Barre</button><button class="btn btn-small btn-primary" data-action="optimize-cuts">Optimiser</button></div></div>
    <div class="summary-grid"><section class="card"><h3 style="margin-top:0">Barres disponibles pour le calcul</h3>${(project.stockBars || []).length ? project.stockBars.map(bar => `<div class="list-row"><div><strong>${escapeHtml(bar.label)}</strong><div class="small">${integer(bar.qty)} × ${integer(bar.length)} mm • trait ${integer(bar.kerf)} mm</div></div><button class="btn btn-small btn-danger" data-delete-bar="${bar.id}">Supprimer</button></div>`).join('') : '<div class="empty-state"><strong>Aucune barre</strong>Chargez les barres rapprochées ou ajoutez-les manuellement.</div>'}</section>
    <section class="card"><h3 style="margin-top:0">Pièces à découper</h3>${woodPieces.length ? woodPieces.map(piece => `<div class="list-row"><div><strong>${escapeHtml(piece.ref)} — ${escapeHtml(piece.name)}</strong><div class="small">${integer(piece.qty)} × ${integer(piece.length)} mm</div></div></div>`).join('') : '<div class="empty-state"><strong>Aucune découpe</strong>Ajoutez des pièces de type « Découpe bois ».</div>'}</section></div>
    <section class="section">${renderCutPlan(project)}</section>`;
}

function renderCutPlan(project) {
  if (!project.cutPlan) return '<div class="empty-state"><strong>Plan non calculé</strong>L’optimiseur répartira les pièces dans les barres disponibles.</div>';
  if (project.cutPlan.error) return `<div class="danger-banner"><strong>Optimisation impossible</strong><div>${escapeHtml(project.cutPlan.error)}</div></div>`;
  return `<div class="card"><div class="section-title-row"><h2 class="section-title">Résultat</h2><span class="badge">Perte ${decimal(project.cutPlan.wastePercent)} %</span></div>${project.cutPlan.bars.map((bar,index) => `<div class="cut-bar"><div class="cut-bar-head"><strong>Barre ${index + 1} — ${escapeHtml(bar.label)}</strong><span>${integer(bar.length - bar.used)} mm de chute</span></div><div class="cut-visual">${bar.items.map(item => `<div class="cut-segment" style="width:${Math.max(6, item.length / bar.length * 100)}%">${escapeHtml(item.ref)}<br>${integer(item.length)}</div>`).join('')}<div class="cut-segment waste" style="width:${Math.max(4,(bar.length-bar.used)/bar.length*100)}%">chute</div></div></div>`).join('')}${project.cutPlan.unplaced?.length ? `<div class="danger-banner"><strong>Pièces non placées</strong><div>${project.cutPlan.unplaced.map(item => `${escapeHtml(item.ref)} (${integer(item.length)} mm)`).join(', ')}</div></div>` : ''}</div>`;
}

function renderProjectPrints(project) {
  return `<div class="section-title-row"><h2 class="section-title">Impressions 3D</h2><button class="btn btn-primary btn-small" data-action="add-print">＋ Ajouter</button></div><div class="card-grid">${(project.prints || []).length ? project.prints.map(print => {
    const filament = state.filaments.find(item => item.id === print.filamentId);
    return `<article class="card"><div class="stock-card-head"><div><span class="badge">${escapeHtml(print.status)}</span><h3>${escapeHtml(print.name)}</h3><div class="meta">Qté ${integer(print.qty)} • ${decimal(print.weight)} g • ${decimal(print.duration)} h</div></div><div class="stock-icon">⬡</div></div><div class="stock-dimensions">${filament ? `${escapeHtml(filament.material)} ${escapeHtml(filament.colorName)} — ${decimal(filamentAvailable(filament))} g disponibles` : `${escapeHtml(print.material || 'Matière non définie')} ${escapeHtml(print.color || '')}`}</div><div class="card-actions"><button class="btn btn-small btn-ghost" data-edit-print="${print.id}">Modifier</button></div></article>`;
  }).join('') : '<div class="empty-state"><strong>Aucune impression</strong>Ajoutez les pièces imprimées nécessaires.</div>'}</div>`;
}

function renderProjectSteps(project) {
  return `<div class="section-title-row"><h2 class="section-title">Étapes de montage</h2><button class="btn btn-primary btn-small" data-action="add-step">＋ Ajouter une étape</button></div><div class="list">${(project.steps || []).length ? project.steps.map((step,index) => `<div class="list-row step-row"><label class="step-check-label"><input type="checkbox" class="check" data-step-check="${step.id}" ${step.done ? 'checked' : ''}><span class="sr-only">Terminer l’étape</span></label><div class="list-row-main"><div class="list-row-title">${index + 1}. ${escapeHtml(step.title)}</div><div class="list-row-sub">${escapeHtml(step.description)}</div></div><button class="btn btn-small btn-ghost" data-edit-step="${step.id}">Modifier</button></div>`).join('') : '<div class="empty-state"><strong>Aucune étape</strong>Les étapes importées apparaîtront ici.</div>'}</div>`;
}

function renderProjectBudget(project) {
  return `<div class="section-title-row"><h2 class="section-title">Budget</h2><button class="btn btn-primary btn-small" data-action="add-expense">＋ Ajouter</button></div><div class="summary-grid"><section class="card"><h3 style="margin-top:0">Dépenses</h3>${(project.expenses || []).length ? project.expenses.map(item => `<div class="list-row"><div><strong>${escapeHtml(item.label)}</strong><div class="small">${escapeHtml(item.category)}</div></div><div><strong>${money(item.amount)}</strong><button class="btn btn-small btn-ghost" data-edit-expense="${item.id}">Modifier</button></div></div>`).join('') : '<div class="empty-state"><strong>Aucune dépense</strong>Ajoutez les achats et consommables.</div>'}</section><section class="card"><h3 style="margin-top:0">Total</h3><div class="metric-value">${money(projectBudget(project))}</div><div class="small">Montant saisi pour ce projet.</div></section></div>`;
}




function renderInventory() {
  const availableRefs = state.inventory.filter(item => stockAvailable(item) > 0).length;
  const scraps = state.inventory.filter(item => item.isScrap && stockAvailable(item) > 0).length;
  const lowRefs = state.inventory.filter(item => num(item.lowThreshold) > 0 && stockAvailable(item) <= num(item.lowThreshold)).length;
  return `<section class="stock-stat-grid"><div class="stock-stat"><span>Références</span><strong>${state.inventory.length}</strong></div><div class="stock-stat"><span>Disponibles</span><strong>${availableRefs}</strong></div><div class="stock-stat"><span>Chutes</span><strong>${scraps}</strong></div><div class="stock-stat"><span>Alertes</span><strong>${lowRefs}</strong></div></section>
    <section class="card" style="margin-top:14px"><div class="form-grid two"><div class="field"><label for="stockSearch">Rechercher</label><input id="stockSearch" class="input" placeholder="Tasseau, vis, contreplaqué, emplacement…"></div><div class="field"><label for="stockCategoryFilter">Catégorie</label><select id="stockCategoryFilter" class="select"><option value="">Toutes</option>${STOCK_CATEGORIES.map(category => `<option>${category}</option>`).join('')}<option value="__scraps">Uniquement les chutes</option></select></div></div></section>
    <section id="inventoryList" class="card-grid section">${state.inventory.length ? state.inventory.map(inventoryCard).join('') : emptyCard('Inventaire vide', 'Décrivez votre atelier à ChatGPT puis importez le fichier obtenu.', 'Importer un inventaire', 'import-inventory')}</section>`;
}

function inventoryCard(item) {
  const available = stockAvailable(item);
  const isLow = item.lowThreshold > 0 && available <= item.lowThreshold;
  const cls = isLow ? 'stock-low' : item.reserved > 0 ? 'stock-reserved' : '';
  const scrapBadge = item.isScrap ? '<span class="badge amber">Chute</span>' : '';
  return `<article class="card ${cls}" data-stock-card="${item.id}"><div class="stock-card-head"><div class="stock-title-wrap"><div class="stock-icon">${STOCK_ICONS[item.stockType] || '◆'}</div><div><div class="actions" style="gap:6px"><span class="badge">${escapeHtml(item.category)}</span>${scrapBadge}</div><h3>${escapeHtml(item.name)}</h3><div class="meta">${escapeHtml(item.material || 'Matière non précisée')}</div></div></div><span class="unit-pill">${escapeHtml(item.unit)}</span></div><div class="stock-dimensions">${formatDimensions(item)}</div><div class="stock-stat-grid"><div class="stock-stat"><span>Total</span><strong>${decimal(item.quantity)}</strong></div><div class="stock-stat"><span>Disponible</span><strong>${decimal(available)}</strong></div><div class="stock-stat"><span>Emplacement</span><strong style="font-size:.86rem">${escapeHtml(item.location || '—')}</strong></div><div class="stock-stat"><span>Origine</span><strong style="font-size:.86rem">${escapeHtml(item.origin || '—')}</strong></div></div><div class="stock-quick-row"><button class="stock-delta" type="button" data-stock-delta="-1" data-stock-id="${item.id}" aria-label="Retirer une unité">−</button><button class="btn btn-small btn-outline" data-adjust-stock="${item.id}">Ajuster</button><button class="stock-delta" type="button" data-stock-delta="1" data-stock-id="${item.id}" aria-label="Ajouter une unité">＋</button></div><div class="card-actions"><button class="btn btn-small btn-ghost" data-edit-stock="${item.id}">Modifier</button>${item.stockType === 'linear' && available > 0 ? `<button class="btn btn-small btn-secondary" data-cut-from-stock="${item.id}">Découper</button>` : ''}<button class="btn btn-small btn-danger" data-delete-stock="${item.id}">Supprimer</button></div></article>`;
}

function renderFilaments() {
  return `<div class="section-title-row"><div><h2 class="section-title">Bobines</h2><div class="small">Chaque bobine possède son identifiant et son étiquette QR.</div></div><div class="actions"><button class="btn btn-small btn-outline" data-action="scan-filament">⌁ Scanner / saisir</button><button class="btn btn-small btn-outline" data-action="print-all-filament-labels">▦ Planche QR</button><button class="btn btn-small btn-primary" data-action="add-filament">＋ Ajouter</button></div></div><div class="card-grid">${state.filaments.length ? state.filaments.map(filament => {
    const available = filamentAvailable(filament);
    const percent = filament.initialWeight ? clamp(filament.remainingWeight / filament.initialWeight * 100, 0, 100) : 0;
    return `<article class="card filament-card ${available < 200 ? 'stock-low' : filament.reservedWeight > 0 ? 'stock-reserved' : ''}"><div class="filament-visual"><div class="color-dot" style="background:${escapeHtml(filament.colorHex)}"></div><span class="filament-code">${escapeHtml(filament.code)}</span></div><div><span class="badge">${escapeHtml(filament.material)}</span><h3>${escapeHtml(filament.colorName)} — ${escapeHtml(filament.brand || 'Sans marque')}</h3><div class="meta">${escapeHtml(filament.range)} • ${escapeHtml(filament.location || 'Emplacement non défini')}</div><div class="filament-progress"><span style="width:${percent}%"></span></div><div class="stock-stat-grid"><div class="stock-stat"><span>Restant</span><strong>${decimal(filament.remainingWeight)} g</strong></div><div class="stock-stat"><span>Réservé</span><strong>${decimal(filament.reservedWeight)} g</strong></div><div class="stock-stat"><span>Disponible</span><strong>${decimal(available)} g</strong></div><div class="stock-stat"><span>Bobine vide</span><strong>${filament.spoolWeight ? `${decimal(filament.spoolWeight)} g` : '—'}</strong></div></div><div class="card-actions"><button class="btn btn-small btn-secondary" data-filament-quick="${filament.id}">Fiche QR</button><button class="btn btn-small btn-outline" data-adjust-filament="${filament.id}">Peser</button><button class="btn btn-small btn-ghost" data-edit-filament="${filament.id}">Modifier</button><button class="btn btn-small btn-danger" data-delete-filament="${filament.id}">Supprimer</button></div></div></article>`;
  }).join('') : emptyCard('Aucune bobine', 'Importez votre inventaire ou ajoutez une bobine manuellement.', 'Ajouter une bobine', 'add-filament')}</div>`;
}

function uniqueLocations() {
  const values = [...state.inventory, ...state.filaments, ...state.tools, ...state.machines]
    .map(item => String(item.location || '').trim())
    .filter(Boolean);
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'fr'));
}

function renderLocations() {
  const locations = uniqueLocations();
  return `<div class="info-banner"><strong>Base du futur plan d’atelier</strong><div class="small">Renseignez des emplacements cohérents, par exemple « Zone quincaillerie • Meuble 1 • Tiroir B • Bac 3 ». Ils pourront ensuite être positionnés sur un plan.</div></div><div class="location-grid section">${locations.length ? locations.map(location => {
    const stock = state.inventory.filter(item => item.location === location).length;
    const filaments = state.filaments.filter(item => item.location === location).length;
    const machines = state.machines.filter(item => item.location === location).length;
    const tools = state.tools.filter(item => item.location === location).length;
    return `<article class="card location-card"><div class="location-pin">⌖</div><div><h3>${escapeHtml(location)}</h3><div class="meta">${stock} stock • ${filaments} bobine(s) • ${machines} machine(s) • ${tools} outil(s)</div></div></article>`;
  }).join('') : emptyCard('Aucun emplacement', 'Ajoutez un emplacement dans les fiches de stock, bobines, machines ou outils.')}</div>`;
}

function renderCuts() {
  const active = state.cutJobs.filter(job => job.status !== 'Terminée');
  const completed = state.cutJobs.filter(job => job.status === 'Terminée').slice(0, 8);
  const linearStock = state.inventory.filter(item => item.stockType === 'linear' && item.lengthMm > 0 && stockAvailable(item) > 0);
  return `${pageHead('Découpes', 'Optimisez directement les barres et chutes présentes dans le stock.', '<button class="btn btn-primary" data-action="new-linear-cut">＋ Nouvelle découpe</button>')}
    <section class="metric-grid"><article class="metric-card"><span class="metric-label">Barres disponibles</span><strong class="metric-value">${linearStock.reduce((sum, item) => sum + stockAvailable(item), 0)}</strong><div class="metric-note">${linearStock.length} référence(s)</div></article><article class="metric-card"><span class="metric-label">Chutes utilisables</span><strong class="metric-value">${linearStock.filter(item => item.isScrap).reduce((sum, item) => sum + stockAvailable(item), 0)}</strong><div class="metric-note">Prioritaires dans l’optimisation</div></article><article class="metric-card"><span class="metric-label">Plans actifs</span><strong class="metric-value">${active.length}</strong><div class="metric-note">À valider après coupe</div></article><article class="metric-card"><span class="metric-label">Plans terminés</span><strong class="metric-value">${state.cutJobs.filter(job => job.status === 'Terminée').length}</strong><div class="metric-note">Historique conservé</div></article></section>
    <section class="section"><div class="section-title-row"><h2 class="section-title">Plans en cours</h2></div><div class="card-grid">${active.length ? active.map(cutJobCard).join('') : emptyCard('Aucun plan en cours', 'Sélectionnez un stock linéaire et saisissez les longueurs souhaitées.', 'Créer un plan', 'new-linear-cut')}</div></section>
    <section class="section"><div class="section-title-row"><h2 class="section-title">Historique</h2></div><div class="card-grid">${completed.length ? completed.map(cutJobCard).join('') : '<div class="empty-state"><strong>Aucune découpe terminée</strong>Les plans validés resteront visibles ici.</div>'}</div></section>`;
}

function cutJobCard(job) {
  const stock = state.inventory.find(item => item.id === job.stockId);
  const totalPieces = (job.requests || []).reduce((sum, item) => sum + num(item.qty), 0);
  const bars = job.plan?.bars?.length || 0;
  const unplaced = job.plan?.unplaced?.length || 0;
  return `<article class="card cut-job-card"><div class="section-title-row"><div><span class="badge ${job.status === 'Terminée' ? 'success' : 'amber'}">${escapeHtml(job.status)}</span><h3>${escapeHtml(job.name)}</h3><div class="meta">${escapeHtml(stock?.name || 'Stock indisponible')} • ${totalPieces} pièce(s)</div></div><div class="cut-job-icon">✂</div></div>${job.plan ? `<div class="stock-stat-grid"><div class="stock-stat"><span>Barres utilisées</span><strong>${bars}</strong></div><div class="stock-stat"><span>Perte théorique</span><strong>${decimal(job.plan.wastePercent || 0)} %</strong></div><div class="stock-stat"><span>Non placées</span><strong>${unplaced}</strong></div><div class="stock-stat"><span>Trait de coupe</span><strong>${decimal(job.kerfMm)} mm</strong></div></div>` : '<div class="info-banner"><strong>Plan non calculé</strong></div>'}<div class="card-actions"><button class="btn btn-small btn-secondary" data-view-cut="${job.id}">Voir le plan</button>${job.status !== 'Terminée' ? `<button class="btn btn-small btn-outline" data-edit-cut="${job.id}">Modifier</button><button class="btn btn-small btn-primary" data-complete-cut="${job.id}">Valider la coupe</button>` : ''}<button class="btn btn-small btn-danger" data-delete-cut="${job.id}">Supprimer</button></div></article>`;
}

function renderWorkshop() {
  const tab = state.ui.workshopTab || 'materials';
  const tabs = [['materials', 'Matériaux'], ['filaments', 'Bobines'], ['tools', 'Outils'], ['movements', 'Mouvements']];
  return `${pageHead('Mon atelier', 'Inventaire, bobines, outillage et historique des mouvements.', '<button class="btn btn-outline" data-action="import-inventory">⬆ Importer</button><button class="btn btn-primary" data-action="add-stock">＋ Ajouter</button>')}
    <div class="stock-tabs">${tabs.map(([id, label]) => `<button class="tab ${tab === id ? 'active' : ''}" data-workshop-tab="${id}">${label}</button>`).join('')}</div>
    ${tab === 'filaments' ? renderFilaments() : tab === 'tools' ? renderTools() : tab === 'movements' ? renderMovements() : renderInventory()}`;
}

function renderInventoryPage() {
  return `${pageHead('Inventaire', 'Matériaux, panneaux, quincaillerie, consommables et chutes.', '<button class="btn btn-outline" data-action="import-inventory">⬆ Importer</button><button class="btn btn-primary" data-action="add-stock">＋ Ajouter</button>')}${renderInventory()}<section class="section"><div class="section-title-row"><h2 class="section-title">Historique récent</h2><button class="btn btn-small btn-outline" data-action="export-inventory">Exporter</button></div>${renderMovementsCompact()}</section>`;
}

function renderMovementsCompact() {
  const list = state.movements.filter(m => m.sourceType === 'inventory').slice(0,8);
  return `<div class="timeline">${list.length ? list.map((movement,index) => { const source = state.inventory.find(item => item.id === movement.sourceId); const negative = movement.type === 'consumption'; return `<div class="timeline-row"><div class="timeline-dot">${index+1}</div><div class="timeline-content"><strong>${escapeHtml(movementLabel(movement))} <span class="${negative ? 'movement-negative' : 'movement-positive'}">${negative ? '−' : '+'}${decimal(movement.quantity)} ${escapeHtml(movement.unit)}</span></strong><small>${escapeHtml(source?.name || 'Élément supprimé')} • ${dateTimeFr(movement.createdAt)}</small>${movement.note ? `<div class="small">${escapeHtml(movement.note)}</div>` : ''}</div></div>`; }).join('') : '<div class="empty-state"><strong>Aucun mouvement</strong>Les ajouts et retraits apparaîtront ici.</div>'}</div>`;
}

function renderFilamentsPage() {
  return `${pageHead('Bobines', 'QR codes, pesées rapides et stock de filament.', '<button class="btn btn-outline" data-action="scan-filament">⌁ Scanner</button><button class="btn btn-primary" data-action="add-filament">＋ Ajouter</button>')}${renderFilaments()}<section class="section"><div class="section-title-row"><h2 class="section-title">Mouvements récents</h2><button class="btn btn-small btn-outline" data-action="print-all-filament-labels">Imprimer les QR</button></div>${renderFilamentMovements()}</section>`;
}

function renderFilamentMovements() {
  const list = state.movements.filter(m => m.sourceType === 'filament').slice(0,8);
  return `<div class="timeline">${list.length ? list.map((movement,index) => { const source = state.filaments.find(item => item.id === movement.sourceId); const negative = movement.type === 'consumption'; return `<div class="timeline-row"><div class="timeline-dot">${index+1}</div><div class="timeline-content"><strong>${escapeHtml(movementLabel(movement))} <span class="${negative ? 'movement-negative' : 'movement-positive'}">${negative ? '−' : '+'}${decimal(movement.quantity)} g</span></strong><small>${escapeHtml(source ? `${source.code} — ${source.material} ${source.colorName}` : 'Bobine supprimée')} • ${dateTimeFr(movement.createdAt)}</small>${movement.note ? `<div class="small">${escapeHtml(movement.note)}</div>` : ''}</div></div>`; }).join('') : '<div class="empty-state"><strong>Aucun mouvement</strong>Les pesées et consommations apparaîtront ici.</div>'}</div>`;
}

function renderEquipmentPage() {
  const tab = state.ui.equipmentTab || 'machines';
  const tabs = [['machines','Machines'],['tools','Outillage']];
  const actions = tab === 'machines'
    ? '<button class="btn btn-primary" data-action="add-machine">＋ Machine</button>'
    : '<button class="btn btn-primary" data-action="add-tool">＋ Outil</button>';
  return `${pageHead('Équipements', 'Choisissez entre les machines de l’atelier et l’outillage manuel ou électroportatif.', actions)}
    <div class="stock-tabs equipment-tabs">${tabs.map(([id,label]) => `<button class="tab ${tab===id?'active':''}" data-equipment-tab="${id}">${label}</button>`).join('')}</div>
    ${tab === 'tools' ? renderTools() : renderMachines()}
    <section class="section card equipment-links"><div><h2 class="section-title">Organisation de l’atelier</h2><p class="meta">Positionnez les équipements sur le plan et retrouvez rapidement leur emplacement.</p></div><div class="card-actions"><button class="btn btn-outline" data-open-atelier-section="plan">⌖ Ouvrir le plan</button><button class="btn btn-ghost" data-open-atelier-section="locations">Emplacements</button></div></section>`;
}

function renderAtelierPage() {
  const tab = state.ui.atelierTab || 'plan';
  const tabs = [['plan','Plan de l’atelier'],['locations','Emplacements'],['more','Plus']];
  const actions = tab === 'plan' ? '<button class="btn btn-outline" data-action="configure-workshop-map">⚙ Configurer</button><button class="btn btn-primary" data-action="add-map-marker">＋ Ajouter un repère</button>' : '';
  return `${pageHead('Atelier', 'Plan interactif et localisation précise des stocks, bobines, machines et outils.', actions)}
    <div class="stock-tabs">${tabs.map(([id,label]) => `<button class="tab ${tab===id?'active':''}" data-atelier-tab="${id}">${label}</button>`).join('')}</div>
    ${tab === 'plan' ? renderWorkshopPlan() : tab === 'more' ? renderMore() : renderLocations()}`;
}

function workshopAllItems() {
  return [
    ...state.inventory.map(item => ({ id:item.id, kind:'stock', title:item.name, subtitle:`${decimal(stockAvailable(item))} ${item.unit}`, location:item.location, route:'inventory' })),
    ...state.filaments.map(item => ({ id:item.id, kind:'filament', title:`${item.code} — ${item.material} ${item.colorName}`, subtitle:`${decimal(filamentAvailable(item))} g disponibles`, location:item.location, route:'filaments' })),
    ...state.machines.map(item => ({ id:item.id, kind:'machine', title:item.name, subtitle:[item.brand,item.model].filter(Boolean).join(' ') || item.category, location:item.location, route:'equipment' })),
    ...state.tools.map(item => ({ id:item.id, kind:'tool', title:item.name, subtitle:item.category, location:item.location, route:'equipment' }))
  ];
}
function locationMatches(markerLocation, itemLocation) {
  const marker = normalizeText(markerLocation); const item = normalizeText(itemLocation);
  return Boolean(marker && item && (item === marker || item.startsWith(`${marker} `) || marker.startsWith(`${item} `)));
}
function itemsForMapMarker(marker) { return workshopAllItems().filter(item => locationMatches(marker.location, item.location)); }
function markerTypeLabel(type) { return ({zone:'Zone',storage:'Rangement',machine:'Machine',tool:'Outillage',stock:'Stock',other:'Repère'})[type] || 'Repère'; }
function markerIcon(type) { return ({zone:'⌂',storage:'▦',machine:'⚙',tool:'🔧',stock:'◆',other:'⌖'})[type] || '⌖'; }
function coveredLocation(location) { return state.workshopMap.markers.some(marker => locationMatches(marker.location, location)); }

function renderWorkshopPlan() {
  const map = state.workshopMap;
  const markers = map.markers || [];
  const locations = uniqueLocations();
  const uncovered = locations.filter(location => !coveredLocation(location));
  const mappedItems = workshopAllItems().filter(item => markers.some(marker => locationMatches(marker.location, item.location))).length;
  const totalItems = workshopAllItems().filter(item => item.location).length;
  const ratio = map.widthMm > 0 && map.depthMm > 0 ? `${map.widthMm} / ${map.depthMm}` : '4 / 3';
  const background = map.backgroundImage ? `background-image:linear-gradient(rgba(247,243,235,.18),rgba(247,243,235,.18)),url('${map.backgroundImage.replace(/'/g, "%27")}');` : '';
  return `<section class="metric-grid atelier-map-metrics"><article class="metric-card"><span class="metric-label">Repères placés</span><strong class="metric-value">${markers.length}</strong><div class="metric-note">Zones, meubles et équipements</div></article><article class="metric-card"><span class="metric-label">Éléments localisés</span><strong class="metric-value">${mappedItems}/${totalItems}</strong><div class="metric-note">Avec un emplacement reconnu</div></article><article class="metric-card"><span class="metric-label">Dimensions</span><strong class="metric-value map-dimension-value">${map.widthMm&&map.depthMm?`${decimal(map.widthMm/1000)} × ${decimal(map.depthMm/1000)} m`:'À renseigner'}</strong><div class="metric-note">${escapeHtml(map.name)}</div></article><article class="metric-card"><span class="metric-label">À positionner</span><strong class="metric-value">${uncovered.length}</strong><div class="metric-note">Emplacement(s) sans repère</div></article></section>
  <section class="card atelier-map-toolbar"><div class="field"><label for="workshopMapSearch">Retrouver un élément</label><input id="workshopMapSearch" class="input" placeholder="Ex. inserts M3, visseuse, PETG noir…"></div><div class="card-actions"><button class="btn btn-outline btn-small" data-action="auto-create-map-markers">Positionner les emplacements</button><button class="btn btn-ghost btn-small" data-action="configure-workshop-map">Importer un plan</button></div><div id="workshopMapSearchResults" class="map-search-results"></div></section>
  <section class="atelier-map-layout section"><div class="atelier-map-panel"><div class="atelier-map-canvas ${map.backgroundImage?'has-background':''}" id="workshopMapCanvas" style="aspect-ratio:${ratio};${background}" aria-label="Plan interactif de l’atelier">${markers.map(marker => { const count=itemsForMapMarker(marker).length; return `<button type="button" class="workshop-map-marker marker-${marker.type}" data-map-marker="${marker.id}" style="left:${marker.xPct}%;top:${marker.yPct}%;width:${Math.min(marker.widthPct,100-marker.xPct)}%;height:${Math.min(marker.heightPct,100-marker.yPct)}%"><span class="map-marker-icon">${markerIcon(marker.type)}</span><strong>${escapeHtml(marker.name)}</strong><small>${count} élément(s)</small></button>`; }).join('')}${markers.length?'':'<div class="map-empty"><strong>Le plan est prêt à être configuré</strong><span>Importez une image du plan ou ajoutez vos premiers repères.</span></div>'}</div><div class="map-legend"><span><i class="legend-swatch marker-storage"></i>Rangement</span><span><i class="legend-swatch marker-machine"></i>Machine</span><span><i class="legend-swatch marker-stock"></i>Stock</span><span><i class="legend-swatch marker-tool"></i>Outillage</span><span class="small">Maintenez et déplacez un repère pour ajuster sa position.</span></div></div>
  <aside class="card atelier-map-side"><div class="section-title-row"><h2 class="section-title">Emplacements à positionner</h2><span class="badge">${uncovered.length}</span></div>${uncovered.length?`<div class="map-unplaced-list">${uncovered.slice(0,20).map(location=>{const count=workshopAllItems().filter(item=>item.location===location).length;return `<button type="button" class="map-unplaced-item" data-add-location-marker="${encodeURIComponent(location)}"><span><strong>${escapeHtml(location)}</strong><small>${count} élément(s)</small></span><b>＋</b></button>`;}).join('')}</div>`:'<div class="empty-state compact"><strong>Tout est positionné</strong>Chaque emplacement possède un repère sur le plan.</div>'}</aside></section>`;
}

function renderMachines() {
  const due = state.machines.filter(machine => ['overdue','today','soon'].includes(machineMaintenanceInfo(machine).key));
  const available = state.machines.filter(machine => machine.status === 'Disponible').length;
  const linkedConsumables = new Set(state.machines.flatMap(machine => machine.consumableStockIds || [])).size;
  return `<div class="metric-grid machine-metrics"><article class="metric-card"><span class="metric-label">Machines</span><strong class="metric-value">${state.machines.length}</strong><div class="metric-note">${available} disponible(s)</div></article><article class="metric-card"><span class="metric-label">Entretiens</span><strong class="metric-value">${due.length}</strong><div class="metric-note">À faire sous 14 jours</div></article><article class="metric-card"><span class="metric-label">Consommables liés</span><strong class="metric-value">${linkedConsumables}</strong><div class="metric-note">Références du stock</div></article></div><div class="section-title-row"><div><h2 class="section-title">Inventaire machines</h2><div class="small">Fiches techniques, accessoires, consommables, notices et historique d’entretien.</div></div></div><div class="card-grid">${state.machines.length ? state.machines.map(machine => { const maintenance = machineMaintenanceInfo(machine); const historyCount = (machine.maintenanceHistory || []).length; return `<article class="card machine-card"><div class="stock-card-head"><div class="stock-title-wrap"><div class="stock-icon">${/impression/i.test(machine.category)?'▤':'⚙'}</div><div><div class="machine-badges"><span class="badge">${escapeHtml(machine.code)}</span><span class="badge ${machine.status==='Disponible'?'success':machine.status==='Maintenance'?'amber':'danger'}">${escapeHtml(machine.status)}</span>${maintenance.key!=='none'?`<span class="badge ${maintenance.tone}">${escapeHtml(maintenance.label)}</span>`:''}</div><h3>${escapeHtml(machine.name)}</h3><div class="meta">${escapeHtml([machine.brand,machine.model].filter(Boolean).join(' ') || machine.category)}</div></div></div></div><div class="kv-grid"><div class="kv"><span>Emplacement</span><strong>${escapeHtml(machine.location || '—')}</strong></div><div class="kv"><span>Puissance</span><strong>${machine.powerW ? `${integer(machine.powerW)} W` : '—'}</strong></div><div class="kv"><span>Trait de coupe</span><strong>${machine.kerfMm ? `${decimal(machine.kerfMm)} mm` : '—'}</strong></div><div class="kv"><span>Historique</span><strong>${historyCount} entretien(s)</strong></div></div>${machine.notes?`<p class="meta">${escapeHtml(machine.notes)}</p>`:''}<div class="card-actions"><button class="btn btn-small btn-secondary" data-machine-quick="${machine.id}">Ouvrir</button><button class="btn btn-small btn-outline" data-maintain-machine="${machine.id}">Entretien</button><button class="btn btn-small btn-ghost" data-edit-machine="${machine.id}">Modifier</button><button class="btn btn-small btn-danger" data-delete-machine="${machine.id}">Supprimer</button></div></article>`; }).join('') : emptyCard('Aucune machine', 'Ajoutez les machines de l’atelier et leurs caractéristiques utiles.', 'Ajouter une machine', 'add-machine')}</div>`;
}

function renderTools() {
  return `<div class="section-title-row"><h2 class="section-title">Outillage</h2><button class="btn btn-small btn-primary" data-action="add-tool">＋ Ajouter un outil</button></div><div class="card-grid">${state.tools.length ? state.tools.map(tool => `<article class="card"><div class="stock-card-head"><div class="stock-title-wrap"><div class="stock-icon">🔧</div><div><span class="badge">${escapeHtml(tool.category)}</span><h3>${escapeHtml(tool.name)}</h3><div class="meta">${escapeHtml(tool.location || 'Emplacement non défini')}</div></div></div></div>${tool.notes ? `<p class="meta">${escapeHtml(tool.notes)}</p>` : ''}<div class="card-actions"><button class="btn btn-small btn-ghost" data-edit-tool="${tool.id}">Modifier</button><button class="btn btn-small btn-danger" data-delete-tool="${tool.id}">Supprimer</button></div></article>`).join('') : emptyCard('Aucun outil', 'L’outillage n’est pas consommé mais peut être recensé.', 'Ajouter un outil', 'add-tool')}</div>`;
}

function movementLabel(movement) {
  return ({ reservation: 'Réservation', release: 'Libération', consumption: 'Consommation', addition: 'Entrée', adjustment: 'Ajustement', scrap: 'Chute récupérée' })[movement.type] || movement.type;
}
function renderMovements() {
  return `<div class="section-title-row"><h2 class="section-title">Historique</h2><button class="btn btn-small btn-outline" data-action="export-inventory">Exporter l’inventaire</button></div><div class="timeline">${state.movements.length ? state.movements.slice(0,100).map((movement,index) => {
    const project = state.projects.find(item => item.id === movement.projectId);
    const source = movement.sourceType === 'filament' ? state.filaments.find(item => item.id === movement.sourceId) : state.inventory.find(item => item.id === movement.sourceId);
    const negative = movement.type === 'consumption';
    return `<div class="timeline-row"><div class="timeline-dot">${index + 1}</div><div class="timeline-content"><strong>${escapeHtml(movementLabel(movement))} <span class="${negative ? 'movement-negative' : 'movement-positive'}">${negative ? '−' : '+'}${decimal(movement.quantity)} ${escapeHtml(movement.unit)}</span></strong><small>${escapeHtml(source ? (source.name || `${source.material || ''} ${source.colorName || ''}`.trim() || 'Élément') : 'Élément supprimé')} ${project ? `• ${escapeHtml(project.name)}` : ''} • ${dateTimeFr(movement.createdAt)}</small>${movement.note ? `<div class="small">${escapeHtml(movement.note)}</div>` : ''}</div></div>`;
  }).join('') : '<div class="empty-state"><strong>Aucun mouvement</strong>Les imports, réservations, ajustements et consommations apparaîtront ici.</div>'}</div>`;
}

function renderImports() {
  return `${pageHead('Importer dans Atelier 2.0', 'Les fichiers préparés avec ChatGPT sont contrôlés avant d’être ajoutés.')}
    <div class="info-banner"><strong>Le principe</strong><div class="small">Décrivez votre projet ou votre inventaire dans une discussion dédiée. ChatGPT génère un fichier JSON Atelier 2.0, puis cette page l’importe et vous montre un aperçu avant validation.</div></div>
    <section class="import-grid section">
      <article class="card import-card"><div style="font-size:2rem">🧰</div><h2 class="section-title">Importer un projet</h2><p class="meta">Pièces, découpes, besoins, impressions 3D, étapes et budget.</p><div class="import-drop"><strong>Fichier atelier-projet-v1.json</strong><div class="small">Le projet ne sera créé qu’après votre validation.</div></div><div class="card-actions"><button class="btn btn-primary" data-action="import-project">Choisir le fichier</button><button class="btn btn-outline" data-action="download-project-example">Exemple</button></div></article>
      <article class="card import-card"><div style="font-size:2rem">▦</div><h2 class="section-title">Importer l’inventaire</h2><p class="meta">Bois, panneaux, quincaillerie, bobines et outils.</p><div class="import-drop"><strong>atelier-inventaire-v1.json</strong><div class="small">Les doublons peuvent être fusionnés automatiquement.</div></div><div class="card-actions"><button class="btn btn-primary" data-action="import-inventory">Choisir le fichier</button><button class="btn btn-outline" data-action="download-inventory-example">Exemple</button></div></article>
    </section>
    <section class="card section"><div class="section-title-row"><h2 class="section-title">Message à utiliser dans ChatGPT</h2><button class="btn btn-small btn-secondary" data-action="copy-chatgpt-prompt">Copier</button></div><p class="meta">Collez ce message dans la discussion dédiée avant de décrire votre projet ou votre atelier.</p><div class="code-note" id="chatgptPromptText">Transforme ma description en fichier JSON compatible avec Atelier 2.0 V1.7. Utilise le format atelier-2.0, version 1.7, et le type project ou inventory. N’invente pas les dimensions importantes : indique les hypothèses dans les notes. Pour un projet, inclus les dimensions, les besoins matière, la nomenclature, les découpes, les impressions 3D, les étapes et le budget si connu. Pour un inventaire, inclus les matériaux, les bobines, les outils et les machines avec leurs quantités, dimensions, emplacements, accessoires et informations d’entretien.</div></section>`;
}

function renderMore() {
  return `<div class="card-grid">
    <article class="card"><div style="font-size:2rem">🧰</div><h2 class="section-title">Dossiers de fabrication</h2><p class="meta">Les anciens projets restent disponibles, mais leur création est facultative.</p><button class="btn btn-outline btn-small" data-route-direct="projects">Ouvrir</button></article>
    <article class="card"><div style="font-size:2rem">⬆</div><h2 class="section-title">Importer un inventaire</h2><p class="meta">Ajoutez matériaux, bobines, outils et machines depuis un fichier.</p><button class="btn btn-outline btn-small" data-action="import-inventory">Importer</button></article>
    <article class="card"><div style="font-size:2rem">⬇</div><h2 class="section-title">Sauvegarde complète</h2><p class="meta">Exportez toutes les données de l’atelier.</p><button class="btn btn-secondary btn-small" data-action="export-data">Exporter</button></article>
    <article class="card"><div style="font-size:2rem">↥</div><h2 class="section-title">Restaurer</h2><p class="meta">Restaurez une sauvegarde complète Atelier 2.0.</p><button class="btn btn-outline btn-small" data-action="import-backup">Importer</button></article>
    <article class="card"><div style="font-size:2rem">⚙</div><h2 class="section-title">Paramètres</h2><p class="meta">Unités et valeurs par défaut de découpe.</p><button class="btn btn-outline btn-small" data-route-direct="settings">Ouvrir</button></article>
    <article class="card"><div style="font-size:2rem">◫</div><h2 class="section-title">Données d’exemple</h2><p class="meta">Chargez un inventaire, des bobines et des machines de démonstration.</p><button class="btn btn-ghost btn-small" data-action="load-demo">Charger</button></article>
    <article class="card"><div style="font-size:2rem">⌫</div><h2 class="section-title">Réinitialiser</h2><p class="meta">Efface toutes les données enregistrées sur cet appareil.</p><button class="btn btn-danger btn-small" data-action="reset-app">Réinitialiser</button></article>
  </div>`;
}

function renderSettings() {
  return `${pageHead('Paramètres', 'Préférences générales de l’atelier.', '<button class="btn btn-primary" data-action="save-settings">Enregistrer</button>')}
    <section class="card"><div class="form-grid two"><div class="field"><label for="settingOwner">Nom</label><input id="settingOwner" class="input" value="${escapeHtml(state.settings.owner)}"></div><div class="field"><label for="settingUnits">Unités</label><select id="settingUnits" class="select"><option value="mm" ${state.settings.units === 'mm' ? 'selected' : ''}>Millimètres</option><option value="cm" ${state.settings.units === 'cm' ? 'selected' : ''}>Centimètres</option></select></div><div class="field"><label for="settingKerf">Trait de coupe par défaut</label><div class="input-group"><input id="settingKerf" class="input" type="number" step="0.1" value="${num(state.settings.defaultKerfMm ?? 3)}"><span class="input-suffix">mm</span></div></div><div class="field"><label for="settingMinScrap">Chute minimale à conserver</label><div class="input-group"><input id="settingMinScrap" class="input" type="number" value="${num(state.settings.defaultMinScrapMm ?? 250)}"><span class="input-suffix">mm</span></div></div><div class="field"><label for="settingElectricity">Prix de l’électricité</label><div class="input-group"><input id="settingElectricity" class="input" type="number" step="0.0001" value="${num(state.settings.electricityPrice)}"><span class="input-suffix">€/kWh</span></div></div><div class="field"><label for="settingPower">Puissance moyenne imprimante</label><div class="input-group"><input id="settingPower" class="input" type="number" step="0.01" value="${num(state.settings.printerPowerKw)}"><span class="input-suffix">kW</span></div></div></div></section>`;
}

function bindPageEvents() {
  $$('[data-route-direct]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.routeDirect)));
  $$('[data-open-project]').forEach(button => button.addEventListener('click', () => navigate('project', { projectId: button.dataset.openProject, projectTab: button.dataset.tab || 'summary' })));
  $$('[data-project-tab]').forEach(button => button.addEventListener('click', () => { state.ui.projectTab = button.dataset.projectTab; saveState(); render(); }));
  $$('[data-project-tab-direct]').forEach(button => button.addEventListener('click', () => { state.ui.projectTab = button.dataset.projectTabDirect; saveState(); render(); }));
  $$('[data-workshop-tab]').forEach(button => button.addEventListener('click', () => { state.ui.workshopTab = button.dataset.workshopTab; saveState(); render(); }));
  $$('[data-equipment-tab]').forEach(button => button.addEventListener('click', () => { state.ui.equipmentTab = button.dataset.equipmentTab; saveState(); render(); }));
  $$('[data-atelier-tab]').forEach(button => button.addEventListener('click', () => { state.ui.atelierTab = button.dataset.atelierTab; saveState(); render(); }));
  $$('[data-open-atelier-section]').forEach(button => button.addEventListener('click', () => navigate('atelier', { atelierTab: button.dataset.openAtelierSection })));
  $$('[data-action]').forEach(button => button.addEventListener('click', () => runAction(button.dataset.action)));
  $$('[data-project-menu]').forEach(button => button.addEventListener('click', () => openProjectMenu(button.dataset.projectMenu)));
  $$('[data-set-project-status]').forEach(button => button.addEventListener('click', () => setProjectStatus(button.dataset.setProjectStatus)));
  $$('[data-edit-stock]').forEach(button => button.addEventListener('click', () => openStockModal(state.inventory.find(item => item.id === button.dataset.editStock))));
  $$('[data-adjust-stock]').forEach(button => button.addEventListener('click', () => openStockAdjustment(button.dataset.adjustStock)));
  $$('[data-stock-delta]').forEach(button => button.addEventListener('click', () => quickAdjustStock(button.dataset.stockId, num(button.dataset.stockDelta))));
  $$('[data-cut-from-stock]').forEach(button => button.addEventListener('click', () => openLinearCutModal(null, button.dataset.cutFromStock)));
  $$('[data-delete-stock]').forEach(button => button.addEventListener('click', () => deleteStock(button.dataset.deleteStock)));
  $$('[data-edit-filament]').forEach(button => button.addEventListener('click', () => openFilamentModal(state.filaments.find(item => item.id === button.dataset.editFilament))));
  $$('[data-adjust-filament]').forEach(button => button.addEventListener('click', () => openFilamentAdjustment(button.dataset.adjustFilament)));
  $$('[data-delete-filament]').forEach(button => button.addEventListener('click', () => deleteFilament(button.dataset.deleteFilament)));
  $$('[data-filament-quick]').forEach(button => button.addEventListener('click', () => openFilamentQuickView(button.dataset.filamentQuick)));
  $$('[data-edit-tool]').forEach(button => button.addEventListener('click', () => openToolModal(state.tools.find(item => item.id === button.dataset.editTool))));
  $$('[data-delete-tool]').forEach(button => button.addEventListener('click', () => deleteTool(button.dataset.deleteTool)));
  $$('[data-machine-quick]').forEach(button => button.addEventListener('click', () => openMachineQuickView(button.dataset.machineQuick)));
  $$('[data-maintain-machine]').forEach(button => button.addEventListener('click', () => openMachineMaintenanceModal(button.dataset.maintainMachine)));
  $$('[data-edit-machine]').forEach(button => button.addEventListener('click', () => openMachineModal(state.machines.find(item => item.id === button.dataset.editMachine))));
  $$('[data-delete-machine]').forEach(button => button.addEventListener('click', () => deleteMachine(button.dataset.deleteMachine)));
  $$('[data-view-cut]').forEach(button => button.addEventListener('click', () => openCutPlan(button.dataset.viewCut)));
  $$('[data-edit-cut]').forEach(button => button.addEventListener('click', () => openLinearCutModal(state.cutJobs.find(item => item.id === button.dataset.editCut))));
  $$('[data-complete-cut]').forEach(button => button.addEventListener('click', () => openCompleteCutModal(button.dataset.completeCut)));
  $$('[data-delete-cut]').forEach(button => button.addEventListener('click', () => deleteCutJob(button.dataset.deleteCut)));
  $$('[data-edit-requirement]').forEach(button => button.addEventListener('click', () => openRequirementModal(button.dataset.editRequirement)));
  $$('[data-delete-requirement]').forEach(button => button.addEventListener('click', () => deleteRequirement(button.dataset.deleteRequirement)));
  $$('[data-edit-piece]').forEach(button => button.addEventListener('click', () => openPieceModal(button.dataset.editPiece)));
  $$('[data-delete-bar]').forEach(button => button.addEventListener('click', () => deleteBar(button.dataset.deleteBar)));
  $$('[data-edit-print]').forEach(button => button.addEventListener('click', () => openPrintModal(button.dataset.editPrint)));
  $$('[data-step-check]').forEach(input => input.addEventListener('change', () => toggleStep(input.dataset.stepCheck, input.checked)));
  $$('[data-edit-step]').forEach(button => button.addEventListener('click', () => openStepModal(button.dataset.editStep)));
  $$('[data-edit-expense]').forEach(button => button.addEventListener('click', () => openExpenseModal(button.dataset.editExpense)));
  $$('[data-add-location-marker]').forEach(button => button.addEventListener('click', () => openMapMarkerModal(null, decodeURIComponent(button.dataset.addLocationMarker))));
  bindWorkshopMapInteractions();
  bindSearchFilters();
}

function runAction(action) {
  const map = {
    'import-project': () => $('#projectImportInput').click(),
    'import-inventory': () => $('#inventoryImportInput').click(),
    'import-backup': () => $('#backupImportInput').click(),
    'manual-project': () => openProjectModal(),
    'add-stock': () => openStockModal(),
    'new-linear-cut': () => openLinearCutModal(),
    'add-filament': () => openFilamentModal(),
    'scan-filament': openFilamentScanner,
    'print-all-filament-labels': printAllFilamentLabels,
    'add-tool': () => openToolModal(),
    'add-machine': () => openMachineModal(),
    'configure-workshop-map': openWorkshopMapSettingsModal,
    'add-map-marker': () => openMapMarkerModal(),
    'auto-create-map-markers': autoCreateMapMarkers,
    'add-requirement': () => openRequirementModal(),
    'rematch-stock': rematchSelectedProject,
    'reserve-stock': reserveSelectedProject,
    'release-stock': releaseSelectedProject,
    'complete-project': openCompleteProjectModal,
    'view-consumption': openConsumptionModal,
    'edit-project': () => openProjectModal(selectedProject()),
    'export-project': exportSelectedProject,
    'add-piece': () => openPieceModal(),
    'load-stock-bars': loadSelectedProjectBars,
    'add-stock-bar': () => openBarModal(),
    'optimize-cuts': optimizeCuts,
    'add-print': () => openPrintModal(),
    'add-step': () => openStepModal(),
    'add-expense': () => openExpenseModal(),
    'download-project-example': () => downloadJson(projectExample(), 'atelier-projet-exemple-v1.3.json'),
    'download-inventory-example': () => downloadJson(inventoryExample(), 'atelier-inventaire-exemple-v1.6.json'),
    'copy-chatgpt-prompt': copyChatGptPrompt,
    'export-data': exportData,
    'export-inventory': exportInventory,
    'save-settings': saveSettings,
    'load-demo': loadDemo,
    'reset-app': resetApp
  };
  map[action]?.();
}


async function resizePlanImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture de l’image impossible.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Image non reconnue.'));
      image.onload = () => {
        const max = 1600; const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1,Math.round(image.width*scale)); canvas.height = Math.max(1,Math.round(image.height*scale));
        const context = canvas.getContext('2d'); context.drawImage(image,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL('image/jpeg',.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function openWorkshopMapSettingsModal() {
  const map = state.workshopMap;
  openModal('Configurer le plan de l’atelier', `<div class="form-grid two"><div class="field"><label for="mapName">Nom du plan</label><input id="mapName" class="input" value="${escapeHtml(map.name)}"></div><div></div><div class="field"><label for="mapWidth">Largeur réelle</label><div class="input-group"><input id="mapWidth" class="input" type="number" min="0" value="${num(map.widthMm)}"><span class="input-suffix">mm</span></div></div><div class="field"><label for="mapDepth">Profondeur réelle</label><div class="input-group"><input id="mapDepth" class="input" type="number" min="0" value="${num(map.depthMm)}"><span class="input-suffix">mm</span></div></div><div class="field" style="grid-column:1/-1"><label for="mapBackgroundFile">Image du plan ou vue de dessus</label><input id="mapBackgroundFile" class="input" type="file" accept="image/*"><small>L’image est réduite et enregistrée localement dans l’application.</small></div><label class="check-label" style="grid-column:1/-1"><input type="checkbox" class="check" id="removeMapBackground"> Supprimer l’image actuelle</label></div><div class="info-banner" style="margin-top:14px"><strong>Conseil</strong><div class="small">Une capture de plan simple, une photo d’un croquis ou une vue exportée depuis SketchUp convient. Les dimensions restent facultatives tant que le plan sert uniquement au repérage.</div></div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-save>Enregistrer</button>`, modal => {
    $('[data-cancel]',modal).addEventListener('click',closeModal);
    $('[data-save]',modal).addEventListener('click',async()=>{
      map.name=$('#mapName',modal).value.trim()||'Atelier principal'; map.widthMm=Math.max(0,num($('#mapWidth',modal).value)); map.depthMm=Math.max(0,num($('#mapDepth',modal).value));
      if($('#removeMapBackground',modal).checked) map.backgroundImage='';
      const file=$('#mapBackgroundFile',modal).files?.[0]; if(file){ try{ map.backgroundImage=await resizePlanImage(file); }catch(error){ return toast(error.message); } }
      await saveState(); closeModal(); render(); toast('Plan de l’atelier mis à jour.');
    });
  });
}
function openMapMarkerModal(existing = null, suggestedLocation = '') {
  const marker = existing || normalizeMapMarker({ name:suggestedLocation.split('•').slice(-1)[0]?.trim() || suggestedLocation || 'Nouveau repère', location:suggestedLocation, type:'storage', xPct:6, yPct:6, widthPct:24, heightPct:18 });
  const locationOptions=uniqueLocations().map(location=>`<option value="${escapeHtml(location)}"></option>`).join('');
  openModal(existing?'Modifier le repère':'Ajouter un repère', `<div class="form-grid two"><div class="field"><label for="markerName">Nom visible *</label><input id="markerName" class="input" value="${escapeHtml(marker.name)}" placeholder="Meuble quincaillerie"></div><div class="field"><label for="markerType">Type</label><select id="markerType" class="select">${[['zone','Zone'],['storage','Rangement'],['machine','Machine'],['tool','Outillage'],['stock','Stock'],['other','Autre']].map(([value,label])=>`<option value="${value}" ${marker.type===value?'selected':''}>${label}</option>`).join('')}</select></div><div class="field" style="grid-column:1/-1"><label for="markerLocation">Emplacement associé *</label><input id="markerLocation" class="input" list="markerLocations" value="${escapeHtml(marker.location)}" placeholder="Zone • Meuble • Tiroir • Bac"><datalist id="markerLocations">${locationOptions}</datalist><small>Les éléments dont l’emplacement commence par ce texte seront rattachés au repère.</small></div><div class="field"><label for="markerX">Position horizontale</label><div class="input-group"><input id="markerX" class="input" type="number" min="0" max="95" step="1" value="${decimal(marker.xPct)}"><span class="input-suffix">%</span></div></div><div class="field"><label for="markerY">Position verticale</label><div class="input-group"><input id="markerY" class="input" type="number" min="0" max="95" step="1" value="${decimal(marker.yPct)}"><span class="input-suffix">%</span></div></div><div class="field"><label for="markerW">Largeur du repère</label><div class="input-group"><input id="markerW" class="input" type="number" min="6" max="90" step="1" value="${decimal(marker.widthPct)}"><span class="input-suffix">%</span></div></div><div class="field"><label for="markerH">Hauteur du repère</label><div class="input-group"><input id="markerH" class="input" type="number" min="6" max="90" step="1" value="${decimal(marker.heightPct)}"><span class="input-suffix">%</span></div></div><div class="field" style="grid-column:1/-1"><label for="markerNotes">Notes</label><textarea id="markerNotes" class="textarea small-textarea">${escapeHtml(marker.notes||'')}</textarea></div></div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button>${existing?'<button class="btn btn-danger" data-delete>Supprimer</button>':''}<button class="btn btn-primary" data-save>Enregistrer</button>`, modal=>{
    $('[data-cancel]',modal).addEventListener('click',closeModal);
    $('[data-delete]',modal)?.addEventListener('click',()=>deleteMapMarker(marker.id));
    $('[data-save]',modal).addEventListener('click',async()=>{const name=$('#markerName',modal).value.trim(),location=$('#markerLocation',modal).value.trim();if(!name||!location)return toast('Le nom et l’emplacement sont obligatoires.');Object.assign(marker,{name,location,type:$('#markerType',modal).value,xPct:clamp(num($('#markerX',modal).value),0,95),yPct:clamp(num($('#markerY',modal).value),0,95),widthPct:clamp(num($('#markerW',modal).value),6,90),heightPct:clamp(num($('#markerH',modal).value),6,90),notes:$('#markerNotes',modal).value.trim()});if(!existing)state.workshopMap.markers.push(marker);await saveState();closeModal();render();toast(existing?'Repère modifié.':'Repère ajouté.');});
  });
}
async function deleteMapMarker(id){const marker=state.workshopMap.markers.find(item=>item.id===id);if(!marker||!confirm(`Supprimer le repère « ${marker.name} » ?`))return;state.workshopMap.markers=state.workshopMap.markers.filter(item=>item.id!==id);await saveState();closeModal();render();toast('Repère supprimé.');}
function openMapMarkerDetails(id){const marker=state.workshopMap.markers.find(item=>item.id===id);if(!marker)return;const items=itemsForMapMarker(marker);openModal(marker.name,`<div class="info-banner"><strong>${escapeHtml(markerTypeLabel(marker.type))} — ${escapeHtml(marker.location)}</strong>${marker.notes?`<div class="small">${escapeHtml(marker.notes)}</div>`:''}</div><div class="section-title-row" style="margin-top:16px"><h3 class="section-title">Contenu localisé</h3><span class="badge">${items.length}</span></div>${items.length?`<div class="list">${items.map(item=>`<div class="list-row"><div><strong>${escapeHtml(item.title)}</strong><div class="small">${escapeHtml(item.subtitle)} • ${escapeHtml(item.location)}</div></div><button class="btn btn-small btn-outline" data-open-map-item="${item.kind}:${item.id}">Ouvrir</button></div>`).join('')}</div>`:`<div class="empty-state compact"><strong>Aucun élément associé</strong>Vérifiez que le champ emplacement commence par « ${escapeHtml(marker.location)} ».</div>`}`,`<button class="btn btn-ghost" data-edit>Modifier le repère</button><button class="btn btn-primary" data-close>Fermer</button>`,modal=>{$('[data-close]',modal).addEventListener('click',closeModal);$('[data-edit]',modal).addEventListener('click',()=>{closeModal();openMapMarkerModal(marker);});$$('[data-open-map-item]',modal).forEach(button=>button.addEventListener('click',()=>{const[kind,itemId]=button.dataset.openMapItem.split(':');closeModal();if(kind==='filament'){navigate('filaments');setTimeout(()=>openFilamentQuickView(itemId),0);}else if(kind==='machine'){navigate('equipment',{equipmentTab:'machines'});setTimeout(()=>openMachineQuickView(itemId),0);}else if(kind==='tool')navigate('equipment',{equipmentTab:'tools'});else navigate('inventory');}));});}
async function autoCreateMapMarkers(){const missing=uniqueLocations().filter(location=>!coveredLocation(location));if(!missing.length)return toast('Tous les emplacements sont déjà positionnés.');const start=state.workshopMap.markers.length;missing.forEach((location,index)=>{const i=start+index,cols=3,row=Math.floor(i/cols),col=i%cols;state.workshopMap.markers.push(normalizeMapMarker({name:location.split('•').slice(-1)[0].trim(),location,type:/machine|etabli|impression/i.test(location)?'machine':/bois|râtelier|stock|chute/i.test(location)?'stock':'storage',xPct:3+col*32,yPct:4+(row%4)*23,widthPct:28,heightPct:18}));});await saveState();render();toast(`${missing.length} repère(s) ajouté(s). Déplacez-les sur le plan.`);}
function bindWorkshopMapInteractions(){const canvas=$('#workshopMapCanvas');if(!canvas)return;$$('[data-map-marker]',canvas).forEach(element=>{let startX=0,startY=0,originX=0,originY=0,moved=false,pointerId=null;const marker=state.workshopMap.markers.find(item=>item.id===element.dataset.mapMarker);if(!marker)return;element.addEventListener('pointerdown',event=>{pointerId=event.pointerId;startX=event.clientX;startY=event.clientY;originX=marker.xPct;originY=marker.yPct;moved=false;element.setPointerCapture?.(pointerId);element.classList.add('dragging');});element.addEventListener('pointermove',event=>{if(pointerId!==event.pointerId)return;const rect=canvas.getBoundingClientRect();const dx=(event.clientX-startX)/rect.width*100,dy=(event.clientY-startY)/rect.height*100;if(Math.abs(dx)+Math.abs(dy)>1)moved=true;marker.xPct=clamp(originX+dx,0,100-marker.widthPct);marker.yPct=clamp(originY+dy,0,100-marker.heightPct);element.style.left=`${marker.xPct}%`;element.style.top=`${marker.yPct}%`;});element.addEventListener('pointerup',async event=>{if(pointerId!==event.pointerId)return;pointerId=null;element.classList.remove('dragging');if(moved){await saveState();toast('Position enregistrée.');}else openMapMarkerDetails(marker.id);});element.addEventListener('pointercancel',()=>{pointerId=null;element.classList.remove('dragging');});});const search=$('#workshopMapSearch'),results=$('#workshopMapSearchResults');search?.addEventListener('input',()=>{const q=normalizeText(search.value);const elements=$$('[data-map-marker]',canvas);elements.forEach(el=>el.classList.remove('map-marker-match','map-marker-dim'));if(q.length<2){results.innerHTML='';return;}const matches=workshopAllItems().filter(item=>normalizeText(`${item.title} ${item.subtitle} ${item.location}`).includes(q));const markerIds=new Set(state.workshopMap.markers.filter(marker=>matches.some(item=>locationMatches(marker.location,item.location))).map(marker=>marker.id));elements.forEach(el=>el.classList.add(markerIds.has(el.dataset.mapMarker)?'map-marker-match':'map-marker-dim'));results.innerHTML=matches.length?matches.slice(0,8).map(item=>`<button type="button" class="map-search-result" data-map-search-location="${encodeURIComponent(item.location)}"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.location||'Emplacement non défini')}</small></span><b>⌖</b></button>`).join(''):'<div class="small">Aucun élément trouvé.</div>';$$('[data-map-search-location]',results).forEach(button=>button.addEventListener('click',()=>{const location=decodeURIComponent(button.dataset.mapSearchLocation),marker=state.workshopMap.markers.find(value=>locationMatches(value.location,location));if(marker){const target=$(`[data-map-marker="${marker.id}"]`,canvas);target?.classList.add('map-marker-pulse');setTimeout(()=>target?.classList.remove('map-marker-pulse'),1200);openMapMarkerDetails(marker.id);}else toast('Cet emplacement n’est pas encore placé sur le plan.');}));});}

function openCreateChooser() {
  openModal('Ajouter dans Atelier 2.0', `<div class="card-grid"><button class="card" type="button" data-choice="stock" style="text-align:left"><div style="font-size:2rem">▦</div><h3>Ajouter au stock</h3><p class="meta">Créer une référence manuellement.</p></button><button class="card" type="button" data-choice="inventory-import" style="text-align:left"><div style="font-size:2rem">⬆</div><h3>Importer un inventaire</h3><p class="meta">Ajouter les matériaux, bobines, outils et machines.</p></button><button class="card" type="button" data-choice="cut" style="text-align:left"><div style="font-size:2rem">✂</div><h3>Nouvelle découpe</h3><p class="meta">Optimiser des barres présentes en stock.</p></button><button class="card" type="button" data-choice="filament" style="text-align:left"><div style="font-size:2rem">◉</div><h3>Ajouter une bobine</h3><p class="meta">Créer sa fiche et son QR code.</p></button></div>`, '', modal => { $$('[data-choice]', modal).forEach(button => button.addEventListener('click', () => { const choice=button.dataset.choice; closeModal(); if(choice==='stock')openStockModal(); if(choice==='inventory-import')$('#inventoryImportInput').click(); if(choice==='cut')openLinearCutModal(); if(choice==='filament')openFilamentModal(); })); });
}

function openModal(title, body, footer = '', binder = null) {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><header class="modal-head"><h2>${escapeHtml(title)}</h2><button class="icon-button" style="color:var(--charcoal);background:var(--soft-gray)" data-close-modal aria-label="Fermer">×</button></header><div class="modal-body">${body}</div>${footer ? `<footer class="modal-footer">${footer}</footer>` : ''}</section></div>`;
  const backdrop = $('[data-modal-backdrop]', root); const modal = $('.modal', root);
  $('[data-close-modal]', root).addEventListener('click', closeModal);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(); });
  binder?.(modal);
}
function closeModal() { stopQrScanner(); $('#modalRoot').innerHTML = ''; }

function bindSearchFilters() {
  const projectSearch = $('#projectSearch'); const projectFilter = $('#projectFilter');
  const filterProjects = () => {
    if (!$('#projectList')) return;
    const q = normalizeText(projectSearch?.value || ''); const status = projectFilter?.value || '';
    const list = state.projects.filter(project => (!q || normalizeText(`${project.name} ${project.category} ${project.description}`).includes(q)) && (!status || project.status === status));
    $('#projectList').innerHTML = list.length ? list.map(projectCard).join('') : '<div class="empty-state"><strong>Aucun résultat</strong>Modifiez les filtres.</div>';
    bindPageEvents();
  };
  projectSearch?.addEventListener('input', filterProjects); projectFilter?.addEventListener('change', filterProjects);
  const stockSearch = $('#stockSearch'); const stockCategory = $('#stockCategoryFilter');
  const filterStock = () => {
    if (!$('#inventoryList')) return;
    const q = normalizeText(stockSearch?.value || ''); const category = stockCategory?.value || '';
    const list = state.inventory.filter(item => (!q || normalizeText(`${item.name} ${item.material} ${item.location} ${item.origin}`).includes(q)) && (!category || (category === '__scraps' ? item.isScrap : item.category === category)));
    $('#inventoryList').innerHTML = list.length ? list.map(inventoryCard).join('') : '<div class="empty-state"><strong>Aucun résultat</strong>Modifiez les filtres.</div>';
    $$('[data-edit-stock]').forEach(button => button.addEventListener('click', () => openStockModal(state.inventory.find(item => item.id === button.dataset.editStock))));
    $$('[data-adjust-stock]').forEach(button => button.addEventListener('click', () => openStockAdjustment(button.dataset.adjustStock)));
    $$('[data-delete-stock]').forEach(button => button.addEventListener('click', () => deleteStock(button.dataset.deleteStock)));
    $$('[data-stock-delta]').forEach(button => button.addEventListener('click', () => quickAdjustStock(button.dataset.stockId, num(button.dataset.stockDelta))));
    $$('[data-cut-from-stock]').forEach(button => button.addEventListener('click', () => openLinearCutModal(null, button.dataset.cutFromStock)));
  };
  stockSearch?.addEventListener('input', filterStock); stockCategory?.addEventListener('change', filterStock);
}


async function quickAdjustStock(id, delta) {
  const item = state.inventory.find(stock => stock.id === id); if (!item || !delta) return;
  if (delta < 0 && item.quantity + delta < item.reserved) return toast('Impossible : une partie du stock est réservée.');
  const next = Math.max(0, item.quantity + delta); const actualDelta = next - item.quantity; if (!actualDelta) return;
  item.quantity = next; addMovement(actualDelta > 0 ? 'addition' : 'consumption', 'inventory', item.id, Math.abs(actualDelta), item.unit, null, actualDelta > 0 ? 'Ajout rapide' : 'Retrait rapide');
  await saveState(); render(); toast(`${item.name} : ${decimal(item.quantity)} ${item.unit}.`);
}

function openMachineModal(existing = null) {
  const data = existing || normalizeMachine({ code: nextMachineCode() });
  const linked = new Set(data.consumableStockIds || []);
  const stockChoices = state.inventory.map(item => `<label class="machine-stock-option"><input type="checkbox" class="check" value="${item.id}" ${linked.has(item.id)?'checked':''}><span><strong>${escapeHtml(item.name)}</strong><small>${decimal(stockAvailable(item))} ${escapeHtml(item.unit)} • ${escapeHtml(item.location || 'sans emplacement')}</small></span></label>`).join('');
  openModal(existing ? 'Modifier la machine' : 'Ajouter une machine', `<div class="form-grid two"><div class="field"><label for="machineCode">Identifiant</label><input id="machineCode" class="input" value="${escapeHtml(data.code || nextMachineCode())}" placeholder="MAC-0001"></div><div class="field"><label for="machineStatus">État</label><select id="machineStatus" class="select">${['Disponible','Maintenance','Hors service','Stockée'].map(value=>`<option ${data.status===value?'selected':''}>${value}</option>`).join('')}</select></div><div class="field" style="grid-column:1/-1"><label for="machineName">Nom *</label><input id="machineName" class="input" value="${escapeHtml(data.name)}" placeholder="Scie à onglet"></div><div class="field"><label for="machineCategory">Catégorie</label><input id="machineCategory" class="input" value="${escapeHtml(data.category)}" placeholder="Découpe, impression 3D…"></div><div class="field"><label for="machineLocation">Emplacement</label><input id="machineLocation" class="input" value="${escapeHtml(data.location)}" placeholder="Établi principal"></div><div class="field"><label for="machineBrand">Marque</label><input id="machineBrand" class="input" value="${escapeHtml(data.brand)}"></div><div class="field"><label for="machineModel">Modèle</label><input id="machineModel" class="input" value="${escapeHtml(data.model)}"></div><div class="field"><label for="machineSerial">Numéro de série</label><input id="machineSerial" class="input" value="${escapeHtml(data.serialNumber)}"></div><div class="field"><label for="machinePower">Puissance</label><div class="input-group"><input id="machinePower" class="input" type="number" value="${num(data.powerW)}"><span class="input-suffix">W</span></div></div><div class="field"><label for="machinePurchaseDate">Date d’achat</label><input id="machinePurchaseDate" class="input" type="date" value="${escapeHtml(data.purchaseDate)}"></div><div class="field"><label for="machinePurchasePrice">Prix d’achat</label><div class="input-group"><input id="machinePurchasePrice" class="input" type="number" step="0.01" value="${num(data.purchasePrice)}"><span class="input-suffix">€</span></div></div><div class="field"><label for="machineWarranty">Garantie jusqu’au</label><input id="machineWarranty" class="input" type="date" value="${escapeHtml(data.warrantyUntil)}"></div><div class="field"><label for="machineKerf">Trait de coupe</label><div class="input-group"><input id="machineKerf" class="input" type="number" step="0.1" value="${num(data.kerfMm)}"><span class="input-suffix">mm</span></div></div><div class="field"><label for="machineCapacity">Capacité principale</label><div class="input-group"><input id="machineCapacity" class="input" type="number" value="${num(data.capacityMm)}"><span class="input-suffix">mm</span></div></div><div class="field"><label for="machineMaintenance">Dernier entretien</label><input id="machineMaintenance" class="input" type="date" value="${escapeHtml(data.lastMaintenance)}"></div><div class="field"><label for="machineNextMaintenance">Prochain entretien</label><input id="machineNextMaintenance" class="input" type="date" value="${escapeHtml(data.nextMaintenance)}"></div><div class="field"><label for="machineInterval">Intervalle habituel</label><div class="input-group"><input id="machineInterval" class="input" type="number" value="${num(data.maintenanceIntervalDays)}"><span class="input-suffix">jours</span></div></div><div class="field" style="grid-column:1/-1"><label for="machineManual">Lien vers la notice</label><input id="machineManual" class="input" type="url" value="${escapeHtml(data.manualUrl)}" placeholder="https://..."></div><div class="field" style="grid-column:1/-1"><label for="machineAccessories">Accessoires disponibles</label><textarea id="machineAccessories" class="textarea small-textarea" placeholder="Un accessoire par ligne">${escapeHtml((data.accessories || []).join('\n'))}</textarea></div><div class="field" style="grid-column:1/-1"><label>Consommables liés au stock</label><div class="machine-stock-picker">${stockChoices || '<div class="small">Ajoutez d’abord des consommables dans l’inventaire.</div>'}</div></div><div class="field" style="grid-column:1/-1"><label for="machineNotes">Notes et réglages utiles</label><textarea id="machineNotes" class="textarea small-textarea">${escapeHtml(data.notes)}</textarea></div></div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-save>Enregistrer</button>`, modal => {
    $('[data-cancel]',modal).addEventListener('click',closeModal);
    $('[data-save]',modal).addEventListener('click',async()=>{ const name=$('#machineName',modal).value.trim(); if(!name)return toast('Le nom est obligatoire.'); const code=normalizeMachineCode($('#machineCode',modal).value)||nextMachineCode(); if(state.machines.some(machine=>machine!==data&&normalizeMachineCode(machine.code)===code))return toast('Cet identifiant machine est déjà utilisé.'); const accessories=$('#machineAccessories',modal).value.split(/\n|,/).map(value=>value.trim()).filter(Boolean); const consumableStockIds=$$('.machine-stock-option input:checked',modal).map(input=>input.value); Object.assign(data,{code,name,category:$('#machineCategory',modal).value.trim()||'Machine d’atelier',status:$('#machineStatus',modal).value,brand:$('#machineBrand',modal).value.trim(),model:$('#machineModel',modal).value.trim(),serialNumber:$('#machineSerial',modal).value.trim(),location:$('#machineLocation',modal).value.trim(),purchaseDate:$('#machinePurchaseDate',modal).value,purchasePrice:Math.max(0,num($('#machinePurchasePrice',modal).value)),warrantyUntil:$('#machineWarranty',modal).value,powerW:Math.max(0,num($('#machinePower',modal).value)),kerfMm:Math.max(0,num($('#machineKerf',modal).value)),capacityMm:Math.max(0,num($('#machineCapacity',modal).value)),lastMaintenance:$('#machineMaintenance',modal).value,nextMaintenance:$('#machineNextMaintenance',modal).value,maintenanceIntervalDays:Math.max(0,Math.round(num($('#machineInterval',modal).value))),manualUrl:$('#machineManual',modal).value.trim(),accessories,consumableStockIds,notes:$('#machineNotes',modal).value.trim()}); if(!existing)state.machines.unshift(data); ensureMachineCodes(); await saveState(); closeModal(); render(); toast(existing?'Machine modifiée.':`Machine ${data.code} ajoutée.`); });
  });
}

function openMachineQuickView(id) {
  const machine = state.machines.find(item => item.id === id); if (!machine) return;
  const maintenance = machineMaintenanceInfo(machine);
  const warranty = machineWarrantyInfo(machine);
  const consumables = (machine.consumableStockIds || []).map(stockId => state.inventory.find(item => item.id === stockId)).filter(Boolean);
  const history = (machine.maintenanceHistory || []).slice(0,10);
  openModal(`${machine.code} — ${machine.name}`, `<div class="machine-detail-head"><div class="machine-detail-icon">${/impression/i.test(machine.category)?'▤':'⚙'}</div><div><div class="machine-badges"><span class="badge ${machine.status==='Disponible'?'success':machine.status==='Maintenance'?'amber':'danger'}">${escapeHtml(machine.status)}</span>${maintenance.key!=='none'?`<span class="badge ${maintenance.tone}">Entretien ${escapeHtml(maintenance.label.toLowerCase())}</span>`:''}</div><h2>${escapeHtml([machine.brand,machine.model].filter(Boolean).join(' ') || machine.category)}</h2><div class="meta">${escapeHtml(machine.location || 'Emplacement non défini')}</div></div></div><div class="stock-stat-grid"><div class="stock-stat"><span>Puissance</span><strong>${machine.powerW?`${integer(machine.powerW)} W`:'—'}</strong></div><div class="stock-stat"><span>Capacité</span><strong>${machine.capacityMm?`${decimal(machine.capacityMm)} mm`:'—'}</strong></div><div class="stock-stat"><span>Trait de coupe</span><strong>${machine.kerfMm?`${decimal(machine.kerfMm)} mm`:'—'}</strong></div><div class="stock-stat"><span>Entretiens</span><strong>${history.length}</strong></div></div><div class="machine-info-grid"><div><span>Numéro de série</span><strong>${escapeHtml(machine.serialNumber||'—')}</strong></div><div><span>Date d’achat</span><strong>${machine.purchaseDate?dateFr(machine.purchaseDate):'—'}</strong></div><div><span>Prix d’achat</span><strong>${machine.purchasePrice?money(machine.purchasePrice):'—'}</strong></div><div><span>Garantie</span><strong>${escapeHtml(warranty||'—')}</strong></div><div><span>Dernier entretien</span><strong>${machine.lastMaintenance?dateFr(machine.lastMaintenance):'—'}</strong></div><div><span>Prochain entretien</span><strong>${machine.nextMaintenance?dateFr(machine.nextMaintenance):'—'}</strong></div></div>${machine.accessories?.length?`<section class="machine-detail-section"><h3>Accessoires</h3><div class="chip-list">${machine.accessories.map(value=>`<span class="chip">${escapeHtml(value)}</span>`).join('')}</div></section>`:''}<section class="machine-detail-section"><h3>Consommables liés</h3>${consumables.length?`<div class="list">${consumables.map(item=>`<div class="list-row"><div><strong>${escapeHtml(item.name)}</strong><div class="small">${decimal(stockAvailable(item))} ${escapeHtml(item.unit)} • ${escapeHtml(item.location||'sans emplacement')}</div></div>${item.lowThreshold&&stockAvailable(item)<=item.lowThreshold?'<span class="badge danger">Stock faible</span>':'<span class="badge success">Disponible</span>'}</div>`).join('')}</div>`:'<div class="empty-state compact"><strong>Aucun consommable lié</strong>Ajoutez-les depuis la fiche machine.</div>'}</section><section class="machine-detail-section"><div class="section-title-row"><h3>Historique d’entretien</h3><span class="badge">${history.length}</span></div>${history.length?`<div class="timeline">${history.map((entry,index)=>`<div class="timeline-row"><div class="timeline-dot">${index+1}</div><div class="timeline-content"><strong>${escapeHtml(entry.type)} • ${entry.date?dateFr(entry.date):'date inconnue'}</strong><small>${entry.cost?money(entry.cost):'Sans coût'}${entry.operatingHours?` • ${decimal(entry.operatingHours)} h`:''}${entry.nextDue?` • prochain ${dateFr(entry.nextDue)}`:''}</small>${entry.notes?`<div class="small">${escapeHtml(entry.notes)}</div>`:''}</div></div>`).join('')}</div>`:'<div class="empty-state compact"><strong>Aucun entretien enregistré</strong></div>'}</section>${machine.notes?`<div class="info-banner"><strong>Notes</strong><div class="small">${escapeHtml(machine.notes)}</div></div>`:''}`, `<button class="btn btn-ghost" data-edit>Modifier</button>${machine.manualUrl?'<a class="btn btn-outline" data-manual target="_blank" rel="noopener">Notice</a>':''}<button class="btn btn-primary" data-maintain>Ajouter un entretien</button>`, modal => {
    $('[data-edit]',modal).addEventListener('click',()=>{closeModal();openMachineModal(machine);});
    $('[data-maintain]',modal).addEventListener('click',()=>{closeModal();openMachineMaintenanceModal(machine.id);});
    const manual=$('[data-manual]',modal); if(manual) manual.href=machine.manualUrl;
  });
}

function openMachineMaintenanceModal(id) {
  const machine = state.machines.find(item => item.id === id); if (!machine) return;
  const today = new Date().toISOString().slice(0,10);
  const suggestedNext = machine.maintenanceIntervalDays ? new Date(Date.now()+machine.maintenanceIntervalDays*86400000).toISOString().slice(0,10) : machine.nextMaintenance || '';
  openModal(`Entretien — ${machine.name}`, `<div class="info-banner"><strong>${escapeHtml(machine.code)} — ${escapeHtml(machine.name)}</strong><div class="small">L’entretien sera ajouté à l’historique et mettra à jour les prochaines échéances.</div></div><div class="form-grid two" style="margin-top:14px"><div class="field"><label for="maintenanceDate">Date</label><input id="maintenanceDate" class="input" type="date" value="${today}"></div><div class="field"><label for="maintenanceType">Type</label><select id="maintenanceType" class="select">${['Nettoyage','Contrôle','Lubrification','Calibration','Remplacement','Réparation','Autre'].map(value=>`<option>${value}</option>`).join('')}</select></div><div class="field"><label for="maintenanceCost">Coût</label><div class="input-group"><input id="maintenanceCost" class="input" type="number" step="0.01" value="0"><span class="input-suffix">€</span></div></div><div class="field"><label for="maintenanceHours">Compteur / heures</label><div class="input-group"><input id="maintenanceHours" class="input" type="number" step="0.1" value="0"><span class="input-suffix">h</span></div></div><div class="field"><label for="maintenanceNext">Prochaine échéance</label><input id="maintenanceNext" class="input" type="date" value="${escapeHtml(suggestedNext)}"></div><label class="check-label"><input type="checkbox" class="check" id="maintenanceAvailable" ${machine.status==='Maintenance'?'checked':''}> Repasser la machine disponible</label><div class="field" style="grid-column:1/-1"><label for="maintenanceNotes">Travaux réalisés</label><textarea id="maintenanceNotes" class="textarea" placeholder="Nettoyage, pièce remplacée, réglage effectué…"></textarea></div></div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-save>Enregistrer l’entretien</button>`, modal => {
    $('[data-cancel]',modal).addEventListener('click',closeModal);
    $('[data-save]',modal).addEventListener('click',async()=>{ const date=$('#maintenanceDate',modal).value||today; const entry={id:uid('maint'),date,type:$('#maintenanceType',modal).value,cost:Math.max(0,num($('#maintenanceCost',modal).value)),operatingHours:Math.max(0,num($('#maintenanceHours',modal).value)),notes:$('#maintenanceNotes',modal).value.trim(),nextDue:$('#maintenanceNext',modal).value}; machine.maintenanceHistory=machine.maintenanceHistory||[]; machine.maintenanceHistory.unshift(entry); machine.lastMaintenance=date; machine.nextMaintenance=entry.nextDue; if($('#maintenanceAvailable',modal).checked)machine.status='Disponible'; await saveState(); closeModal(); render(); toast('Entretien enregistré.'); });
  });
}

async function deleteMachine(id) { const machine=state.machines.find(item=>item.id===id); if(!machine||!confirm(`Supprimer « ${machine.name} » ?`))return; state.machines=state.machines.filter(item=>item.id!==id); state.cutJobs.forEach(job=>{if(job.machineId===id)job.machineId=null;}); await saveState(); render(); toast('Machine supprimée.'); }

function parseCutRequests(text) {
  const rows=[];
  String(text||'').split(/\n|,/).map(line=>line.trim()).filter(Boolean).forEach((line,index)=>{
    let ref=String.fromCharCode(65+index), length=0, qty=1, note='';
    const semi=line.split(';').map(x=>x.trim());
    if(semi.length>=2){ ref=semi[0]||ref; length=num(semi[1]); qty=Math.max(1,Math.round(num(semi[2]||1))); note=semi.slice(3).join(';'); }
    else {
      const m=line.match(/(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(?:mm)?(?:\s+([A-Za-z0-9_-]+))?/i);
      if(m){ qty=Math.max(1,Math.round(num(m[1]||1))); length=num(String(m[2]).replace(',','.')); if(m[3])ref=m[3]; }
    }
    if(length>0)rows.push({ref,lengthMm:length,qty,note});
  });
  return rows;
}

function compatibleLinearStock(base) {
  return state.inventory.filter(item => item.stockType==='linear' && item.lengthMm>0 && stockAvailable(item)>0 && num(item.widthMm)===num(base.widthMm) && num(item.thicknessMm)===num(base.thicknessMm) && (!base.material || !item.material || normalizeText(item.material)===normalizeText(base.material)));
}

function calculateLinearPlan(job) {
  const base=state.inventory.find(item=>item.id===job.stockId);
  if(!base)return {error:'Le stock sélectionné n’existe plus.',bars:[],unplaced:[],wastePercent:0};
  let sources=[base];
  if(job.useCompatibleScraps) sources=compatibleLinearStock(base).filter(item=>item.id===base.id||item.isScrap);
  const seen=new Set(); sources=sources.filter(item=>!seen.has(item.id)&&seen.add(item.id));
  const bars=[];
  sources.forEach(source=>{ for(let i=0;i<Math.floor(stockAvailable(source));i++) bars.push({sourceId:source.id,label:source.name,length:source.lengthMm,isScrap:Boolean(source.isScrap),kerf:job.kerfMm,trim:job.trimMm,used:job.trimMm,items:[],remaining:source.lengthMm-job.trimMm*2}); });
  bars.sort((a,b)=>(b.isScrap-a.isScrap)||(a.length-b.length));
  const cuts=job.requests.flatMap(item=>Array.from({length:item.qty},()=>({ref:item.ref,length:item.lengthMm,note:item.note}))).sort((a,b)=>b.length-a.length);
  const unplaced=[];
  cuts.forEach(cut=>{
    const candidates=bars.filter(bar=>bar.length-bar.used-job.trimMm >= cut.length+job.kerfMm).sort((a,b)=>(a.length-a.used)-(b.length-b.used));
    const bar=candidates[0]; if(!bar){unplaced.push(cut);return;}
    bar.items.push(cut); bar.used+=cut.length+job.kerfMm; bar.remaining=Math.max(0,bar.length-bar.used-job.trimMm);
  });
  const usedBars=bars.filter(bar=>bar.items.length);
  const total=usedBars.reduce((sum,bar)=>sum+bar.length,0); const useful=usedBars.reduce((sum,bar)=>sum+bar.items.reduce((x,item)=>x+item.length,0),0);
  return {bars:usedBars,unplaced,wastePercent:total?Math.max(0,(total-useful)/total*100):0,sourceName:base.name};
}

function requestsToText(requests) { return requests.map(item=>`${item.ref};${item.lengthMm};${item.qty}${item.note?`;${item.note}`:''}`).join('\n'); }

function openLinearCutModal(existing=null,preselectedStockId=null) {
  const linear=state.inventory.filter(item=>item.stockType==='linear'&&item.lengthMm>0&&stockAvailable(item)>0);
  if(!linear.length)return toast('Ajoutez d’abord une barre ou une chute linéaire au stock.');
  const data=existing||normalizeCutJob({stockId:preselectedStockId||linear[0].id,kerfMm:state.settings.defaultKerfMm||3,minScrapMm:state.settings.defaultMinScrapMm||250,requests:[]});
  const machines=state.machines.filter(machine=>machine.status==='Disponible');
  openModal(existing?'Modifier le plan de coupe':'Nouvelle découpe linéaire', `<div class="form-grid two"><div class="field" style="grid-column:1/-1"><label for="cutName">Nom</label><input id="cutName" class="input" value="${escapeHtml(data.name==='Découpe sans nom'?'':data.name)}" placeholder="Tasseaux pour étagère"></div><div class="field" style="grid-column:1/-1"><label for="cutStock">Stock principal *</label><select id="cutStock" class="select">${linear.map(item=>`<option value="${item.id}" ${data.stockId===item.id?'selected':''}>${escapeHtml(item.name)} — ${decimal(stockAvailable(item))} × ${integer(item.lengthMm)} mm${item.isScrap?' (chute)':''}</option>`).join('')}</select></div><div class="field"><label for="cutMachine">Machine</label><select id="cutMachine" class="select"><option value="">Aucune</option>${machines.map(machine=>{const maintenance=machineMaintenanceInfo(machine);return `<option value="${machine.id}" ${data.machineId===machine.id?'selected':''}>${escapeHtml(machine.name)}${machine.kerfMm?` — trait ${decimal(machine.kerfMm)} mm`:''}${['overdue','today','soon'].includes(maintenance.key)?' — entretien à prévoir':''}</option>`;}).join('')}</select></div><div class="field"><label for="cutKerf">Trait de coupe</label><div class="input-group"><input id="cutKerf" class="input" type="number" step="0.1" value="${num(data.kerfMm)}"><span class="input-suffix">mm</span></div></div><div class="field"><label for="cutTrim">Marge à chaque extrémité</label><div class="input-group"><input id="cutTrim" class="input" type="number" value="${num(data.trimMm)}"><span class="input-suffix">mm</span></div></div><div class="field"><label for="cutMinScrap">Chute minimale à conserver</label><div class="input-group"><input id="cutMinScrap" class="input" type="number" value="${num(data.minScrapMm)}"><span class="input-suffix">mm</span></div></div><label class="check-label" style="grid-column:1/-1"><input type="checkbox" class="check" id="cutUseScraps" ${data.useCompatibleScraps?'checked':''}> Utiliser en priorité les chutes compatibles</label><div class="field" style="grid-column:1/-1"><label for="cutRequests">Pièces à obtenir *</label><textarea id="cutRequests" class="textarea cut-request-area" placeholder="A;720;2\nB;650;4\nC;420;3">${escapeHtml(requestsToText(data.requests))}</textarea><small>Une ligne par pièce : Référence ; longueur en mm ; quantité. Exemple : A;720;2</small></div></div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-save>Calculer le plan</button>`, modal=>{
    $('#cutMachine',modal).addEventListener('change',event=>{const machine=state.machines.find(item=>item.id===event.target.value); if(machine&&machine.kerfMm)$('#cutKerf',modal).value=machine.kerfMm;});
    $('[data-cancel]',modal).addEventListener('click',closeModal);
    $('[data-save]',modal).addEventListener('click',async()=>{const requests=parseCutRequests($('#cutRequests',modal).value); if(!requests.length)return toast('Ajoutez au moins une longueur à découper.'); Object.assign(data,{name:$('#cutName',modal).value.trim()||`Découpe du ${new Date().toLocaleDateString('fr-FR')}`,stockId:$('#cutStock',modal).value,machineId:$('#cutMachine',modal).value||null,kerfMm:Math.max(0,num($('#cutKerf',modal).value)),trimMm:Math.max(0,num($('#cutTrim',modal).value)),minScrapMm:Math.max(0,num($('#cutMinScrap',modal).value)),useCompatibleScraps:$('#cutUseScraps',modal).checked,requests,status:'Planifié'}); data.plan=calculateLinearPlan(data); if(!existing)state.cutJobs.unshift(data); await saveState(); closeModal(); navigate('cuts'); openCutPlan(data.id); });
  });
}

function cutPlanHtml(job) {
  if(!job.plan)return '<div class="empty-state"><strong>Plan non calculé</strong></div>';
  if(job.plan.error)return `<div class="danger-banner"><strong>Optimisation impossible</strong><div>${escapeHtml(job.plan.error)}</div></div>`;
  return `<div class="cut-plan-summary"><div class="stock-stat-grid"><div class="stock-stat"><span>Barres utilisées</span><strong>${job.plan.bars.length}</strong></div><div class="stock-stat"><span>Pièces placées</span><strong>${job.plan.bars.reduce((sum,bar)=>sum+bar.items.length,0)}</strong></div><div class="stock-stat"><span>Pièces manquantes</span><strong>${job.plan.unplaced.length}</strong></div><div class="stock-stat"><span>Perte brute</span><strong>${decimal(job.plan.wastePercent)} %</strong></div></div>${job.plan.bars.map((bar,index)=>`<div class="cut-bar"><div class="cut-bar-head"><strong>${bar.isScrap?'Chute':'Barre'} ${index+1} — ${integer(bar.length)} mm</strong><span>Reste ${integer(bar.remaining)} mm</span></div><div class="cut-visual">${bar.items.map(item=>`<div class="cut-segment" style="width:${Math.max(7,item.length/bar.length*100)}%"><b>${escapeHtml(item.ref)}</b><br>${integer(item.length)}</div>`).join('')}<div class="cut-segment waste" style="width:${Math.max(4,bar.remaining/bar.length*100)}%">${integer(bar.remaining)}</div></div><div class="small">Source : ${escapeHtml(bar.label)} • trait ${decimal(job.kerfMm)} mm${job.trimMm?` • marges ${decimal(job.trimMm)} mm`:''}</div></div>`).join('')}${job.plan.unplaced.length?`<div class="danger-banner"><strong>Pièces non placées</strong><div>${job.plan.unplaced.map(item=>`${escapeHtml(item.ref)} — ${integer(item.length)} mm`).join(', ')}</div></div>`:''}</div>`;
}

function openCutPlan(id) { const job=state.cutJobs.find(item=>item.id===id); if(!job)return; openModal(job.name,`${cutPlanHtml(job)}<div class="info-banner" style="margin-top:14px"><strong>Ordre conseillé</strong><div class="small">Repérez les pièces avant la coupe. Mesurez la chute réelle à la fin : elle peut différer du calcul théorique.</div></div>`,job.status==='Terminée'?'<button class="btn btn-ghost" data-close>Fermer</button>':'<button class="btn btn-ghost" data-edit>Modifier</button><button class="btn btn-primary" data-complete>Valider la coupe</button>',modal=>{ $('[data-close]',modal)?.addEventListener('click',closeModal); $('[data-edit]',modal)?.addEventListener('click',()=>{closeModal();openLinearCutModal(job);}); $('[data-complete]',modal)?.addEventListener('click',()=>{closeModal();openCompleteCutModal(job.id);}); }); }

function openCompleteCutModal(id) {
  const job=state.cutJobs.find(item=>item.id===id); if(!job||!job.plan||job.status==='Terminée')return;
  if(job.plan.unplaced.length)return toast('Certaines pièces ne sont pas placées. Modifiez le plan avant validation.');
  openModal('Valider la découpe', `<div class="info-banner"><strong>Le stock sera mis à jour</strong><div class="small">Chaque barre utilisée sera retirée. Modifiez les longueurs de chute avec les mesures réelles.</div></div><div class="complete-grid section">${job.plan.bars.map((bar,index)=>`<div class="complete-item"><h3>${bar.isScrap?'Chute':'Barre'} ${index+1} — ${escapeHtml(bar.label)}</h3><div class="form-grid two"><div class="field"><label for="actualScrap_${index}">Chute réelle</label><div class="input-group"><input id="actualScrap_${index}" class="input" type="number" value="${Math.round(bar.remaining)}"><span class="input-suffix">mm</span></div></div><label class="check-label"><input type="checkbox" class="check" id="keepScrap_${index}" ${bar.remaining>=job.minScrapMm?'checked':''}> Ajouter au stock</label></div></div>`).join('')}</div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-confirm>Mettre à jour le stock</button>`,modal=>{ $('[data-cancel]',modal).addEventListener('click',closeModal); $('[data-confirm]',modal).addEventListener('click',async()=>{const usedBySource=new Map(); job.plan.bars.forEach((bar,index)=>{usedBySource.set(bar.sourceId,(usedBySource.get(bar.sourceId)||0)+1); const actual=Math.max(0,num($(`#actualScrap_${index}`,modal).value)); if($(`#keepScrap_${index}`,modal).checked&&actual>=job.minScrapMm){const source=state.inventory.find(item=>item.id===bar.sourceId); if(source){const scrap=normalizeInventoryItem({name:`Chute ${source.name.replace(/^Chute\s+/i,'')}`,category:source.category,material:source.material,stockType:'linear',unit:'barre',quantity:1,lengthMm:actual,widthMm:source.widthMm,thicknessMm:source.thicknessMm,location:source.location||'Bac à chutes',unitCost:0,isScrap:true,origin:job.name,parentStockId:source.id,notes:''}); state.inventory.unshift(scrap); addMovement('addition','inventory',scrap.id,1,'barre',null,`Chute de ${integer(actual)} mm issue de ${job.name}`);}} }); usedBySource.forEach((count,sourceId)=>{const source=state.inventory.find(item=>item.id===sourceId); if(source){source.quantity=Math.max(0,source.quantity-count); source.reserved=Math.min(source.reserved,source.quantity); addMovement('consumption','inventory',source.id,count,source.unit,null,`Découpe : ${job.name}`);}}); job.status='Terminée'; job.completedAt=new Date().toISOString(); await saveState(); closeModal(); navigate('cuts'); toast('Découpe validée et stock mis à jour.'); }); });
}

async function deleteCutJob(id) { const job=state.cutJobs.find(item=>item.id===id); if(!job||!confirm(`Supprimer le plan « ${job.name} » ?`))return; state.cutJobs=state.cutJobs.filter(item=>item.id!==id); await saveState(); render(); toast('Plan supprimé.'); }

function openProjectMenu(projectId) {
  const project = state.projects.find(item => item.id === projectId); if (!project) return;
  openModal(project.name, `<div class="list"><button class="list-row" data-menu-action="open"><span><strong>Ouvrir le projet</strong><span class="list-row-sub" style="display:block">Consulter toutes les informations</span></span><strong>→</strong></button><button class="list-row" data-menu-action="export"><span><strong>Exporter le projet</strong><span class="list-row-sub" style="display:block">Créer un fichier JSON Atelier 2.0</span></span><strong>↓</strong></button><button class="list-row" data-menu-action="duplicate"><span><strong>Dupliquer</strong><span class="list-row-sub" style="display:block">Créer une copie indépendante</span></span><strong>＋</strong></button><button class="list-row" data-menu-action="delete"><span><strong>Supprimer</strong><span class="list-row-sub" style="display:block">Libère d’abord les réservations</span></span><strong>×</strong></button></div>`, '', modal => {
    $$('[data-menu-action]', modal).forEach(button => button.addEventListener('click', async () => {
      const action = button.dataset.menuAction; closeModal();
      if (action === 'open') navigate('project', { projectId });
      if (action === 'export') exportProject(project);
      if (action === 'duplicate') { const copy = normalizeProject(JSON.parse(JSON.stringify(project))); copy.id = uid('project'); copy.name += ' — copie'; copy.status = 'Brouillon'; copy.completedAt = null; copy.actualConsumption = []; copy.requirements.forEach(req => { req.id = uid('req'); req.reservedQty = 0; req.reservationUnit = ''; }); state.projects.unshift(copy); await saveState(); render(); toast('Projet dupliqué.'); }
      if (action === 'delete') await deleteProject(project);
    }));
  });
}

async function setProjectStatus(status) {
  const project = selectedProject(); if (!project || project.status === status) return;
  if (status === 'Terminé') return openCompleteProjectModal();
  project.status = status; project.updatedAt = new Date().toISOString(); await saveState(); render(); toast(`Statut : ${status}`);
}

async function deleteProject(project) {
  if (!confirm(`Supprimer le projet « ${project.name} » ?`)) return;
  if ((project.requirements || []).some(req => req.reservedQty > 0)) releaseProjectStock(project, false);
  state.projects = state.projects.filter(item => item.id !== project.id); if (state.ui.selectedProjectId === project.id) state.ui.selectedProjectId = state.projects[0]?.id || null;
  await saveState(); render(); toast('Projet supprimé.');
}

function openProjectModal(existing = null) {
  const data = existing || { name: '', category: 'Projet', status: 'Brouillon', width: 0, depth: 0, height: 0, icon: '🛠️', description: '' };
  const isEdit = Boolean(existing);
  openModal(isEdit ? 'Modifier le projet' : 'Créer un projet', `<div class="form-grid two">
    <div class="field"><label for="projectName">Nom *</label><input id="projectName" class="input" value="${escapeHtml(data.name)}" placeholder="Étagère murale"></div>
    <div class="field"><label for="projectCategory">Catégorie</label><input id="projectCategory" class="input" value="${escapeHtml(data.category)}" placeholder="Menuiserie"></div>
    <div class="field"><label for="projectStatus">Statut</label><select id="projectStatus" class="select">${STATUS_OPTIONS.map(status => `<option ${data.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></div>
    <div class="field"><label for="projectIcon">Icône</label><input id="projectIcon" class="input" value="${escapeHtml(data.icon || '🛠️')}" maxlength="4"></div>
    <div class="field"><label for="projectWidth">Largeur</label><div class="input-group"><input id="projectWidth" class="input" type="number" inputmode="decimal" value="${num(data.width)}"><span class="input-suffix">mm</span></div></div>
    <div class="field"><label for="projectDepth">Profondeur</label><div class="input-group"><input id="projectDepth" class="input" type="number" inputmode="decimal" value="${num(data.depth)}"><span class="input-suffix">mm</span></div></div>
    <div class="field"><label for="projectHeight">Hauteur</label><div class="input-group"><input id="projectHeight" class="input" type="number" inputmode="decimal" value="${num(data.height)}"><span class="input-suffix">mm</span></div></div>
    <div class="field" style="grid-column:1/-1"><label for="projectDescription">Description</label><textarea id="projectDescription" class="textarea">${escapeHtml(data.description)}</textarea></div>
  </div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-save>${isEdit ? 'Enregistrer' : 'Créer'}</button>`, modal => {
    $('[data-cancel]', modal).addEventListener('click', closeModal);
    $('[data-save]', modal).addEventListener('click', async () => {
      const name = $('#projectName', modal).value.trim(); if (!name) return toast('Le nom est obligatoire.');
      const project = existing || normalizeProject({ name });
      Object.assign(project, { name, category: $('#projectCategory', modal).value.trim() || 'Projet', status: $('#projectStatus', modal).value, icon: $('#projectIcon', modal).value.trim() || '🛠️', width: num($('#projectWidth', modal).value), depth: num($('#projectDepth', modal).value), height: num($('#projectHeight', modal).value), description: $('#projectDescription', modal).value.trim(), updatedAt: new Date().toISOString() });
      if (!existing) state.projects.unshift(project);
      state.ui.selectedProjectId = project.id; state.ui.projectTab = 'summary'; await saveState(); closeModal(); navigate('project', { projectId: project.id }); toast(isEdit ? 'Projet modifié.' : 'Projet créé.');
    });
  });
}

function openStockModal(existing = null) {
  const data = existing || normalizeInventoryItem({ category: 'Bois', stockType: 'linear', unit: 'barre', quantity: 1 });
  const isEdit = Boolean(existing);
  openModal(isEdit ? 'Modifier le stock' : 'Ajouter au stock', `<div class="form-grid two">
    <div class="field" style="grid-column:1/-1"><label for="stockName">Désignation *</label><input id="stockName" class="input" value="${escapeHtml(data.name)}" placeholder="Tasseau sapin 35 × 60 mm"></div>
    <div class="field"><label for="stockCategory">Catégorie</label><select id="stockCategory" class="select">${STOCK_CATEGORIES.map(category => `<option ${data.category === category ? 'selected' : ''}>${category}</option>`).join('')}</select></div>
    <div class="field"><label for="stockType">Type de stock</label><select id="stockType" class="select">${STOCK_TYPES.map(([value,label]) => `<option value="${value}" ${data.stockType === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
    <div class="field"><label for="stockMaterial">Matière</label><input id="stockMaterial" class="input" value="${escapeHtml(data.material)}" placeholder="Sapin, acier, MDF…"></div>
    <div class="field"><label for="stockUnit">Unité</label><input id="stockUnit" class="input" value="${escapeHtml(data.unit)}" placeholder="barre, pièce, panneau…"></div>
    <div class="field"><label for="stockQty">Quantité totale</label><input id="stockQty" class="input" type="number" step="0.01" inputmode="decimal" value="${num(data.quantity)}"></div>
    <div class="field"><label for="stockThreshold">Seuil d’alerte</label><input id="stockThreshold" class="input" type="number" step="0.01" inputmode="decimal" value="${num(data.lowThreshold)}"></div>
    <div class="field"><label for="stockLength">Longueur</label><div class="input-group"><input id="stockLength" class="input" type="number" inputmode="decimal" value="${num(data.lengthMm)}"><span class="input-suffix">mm</span></div></div>
    <div class="field"><label for="stockWidth">Largeur</label><div class="input-group"><input id="stockWidth" class="input" type="number" inputmode="decimal" value="${num(data.widthMm)}"><span class="input-suffix">mm</span></div></div>
    <div class="field"><label for="stockThickness">Épaisseur / hauteur</label><div class="input-group"><input id="stockThickness" class="input" type="number" inputmode="decimal" value="${num(data.thicknessMm)}"><span class="input-suffix">mm</span></div></div>
    <div class="field"><label for="stockLocation">Emplacement</label><input id="stockLocation" class="input" value="${escapeHtml(data.location)}" placeholder="Zone bois • Râtelier bas"></div>
    <div class="field"><label for="stockCost">Coût unitaire</label><div class="input-group"><input id="stockCost" class="input" type="number" step="0.01" value="${num(data.unitCost)}"><span class="input-suffix">€</span></div></div>
    <label class="check-label" style="grid-column:1/-1"><input type="checkbox" class="check" id="stockIsScrap" ${data.isScrap ? 'checked' : ''}> Cet élément est une chute récupérée</label>
    <div class="field" style="grid-column:1/-1"><label for="stockOrigin">Origine de la chute</label><input id="stockOrigin" class="input" value="${escapeHtml(data.origin)}" placeholder="Découpe étagère, reste d’achat…"></div>
    <div class="field" style="grid-column:1/-1"><label for="stockNotes">Notes</label><textarea id="stockNotes" class="textarea small-textarea">${escapeHtml(data.notes)}</textarea></div>
  </div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-save>${isEdit ? 'Enregistrer' : 'Ajouter'}</button>`, modal => {
    $('#stockType', modal).addEventListener('change', event => { if (!isEdit) $('#stockUnit', modal).value = defaultUnit(event.target.value); });
    $('[data-cancel]', modal).addEventListener('click', closeModal);
    $('[data-save]', modal).addEventListener('click', async () => {
      const name = $('#stockName', modal).value.trim(); if (!name) return toast('La désignation est obligatoire.');
      const previousQty = existing ? existing.quantity : 0;
      Object.assign(data, { name, category: $('#stockCategory', modal).value, stockType: $('#stockType', modal).value, material: $('#stockMaterial', modal).value.trim(), unit: $('#stockUnit', modal).value.trim() || defaultUnit($('#stockType', modal).value), quantity: Math.max(0, num($('#stockQty', modal).value)), lowThreshold: Math.max(0, num($('#stockThreshold', modal).value)), lengthMm: Math.max(0, num($('#stockLength', modal).value)), widthMm: Math.max(0, num($('#stockWidth', modal).value)), thicknessMm: Math.max(0, num($('#stockThickness', modal).value)), location: $('#stockLocation', modal).value.trim(), unitCost: Math.max(0, num($('#stockCost', modal).value)), isScrap: $('#stockIsScrap', modal).checked, origin: $('#stockOrigin', modal).value.trim(), notes: $('#stockNotes', modal).value.trim() });
      data.reserved = clamp(num(data.reserved), 0, data.quantity);
      if (!existing) state.inventory.unshift(data);
      const delta = data.quantity - previousQty; if (delta) addMovement(existing ? 'adjustment' : 'addition', 'inventory', data.id, Math.abs(delta), data.unit, null, existing ? `Quantité ${delta > 0 ? 'augmentée' : 'réduite'}` : 'Ajout manuel');
      state.projects.forEach(project => rematchProjectRequirements(project, true)); await saveState(); closeModal(); render(); toast(isEdit ? 'Stock modifié.' : 'Stock ajouté.');
    });
  });
}

function openStockAdjustment(id) {
  const item = state.inventory.find(stock => stock.id === id); if (!item) return;
  openModal('Ajuster la quantité', `<div class="info-banner"><strong>${escapeHtml(item.name)}</strong><div class="small">Quantité actuelle : ${decimal(item.quantity)} ${escapeHtml(item.unit)}, dont ${decimal(item.reserved)} réservés.</div></div><div class="form-grid" style="margin-top:14px"><div class="field"><label for="adjustStockQty">Nouvelle quantité physique</label><input id="adjustStockQty" class="input" type="number" step="0.01" value="${num(item.quantity)}"></div><div class="field"><label for="adjustStockNote">Motif</label><input id="adjustStockNote" class="input" placeholder="Comptage réel, erreur de saisie…"></div></div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-save>Ajuster</button>`, modal => {
    $('[data-cancel]', modal).addEventListener('click', closeModal);
    $('[data-save]', modal).addEventListener('click', async () => {
      const next = Math.max(0, num($('#adjustStockQty', modal).value)); if (next < item.reserved && !confirm('La nouvelle quantité est inférieure à la quantité réservée. Réduire aussi la réservation globale ?')) return;
      const delta = next - item.quantity; item.quantity = next; item.reserved = Math.min(item.reserved, next); addMovement('adjustment', 'inventory', item.id, Math.abs(delta), item.unit, null, $('#adjustStockNote', modal).value.trim() || `Ajustement ${delta >= 0 ? 'positif' : 'négatif'}`);
      await saveState(); closeModal(); render(); toast('Quantité ajustée.');
    });
  });
}

async function deleteStock(id) {
  const item = state.inventory.find(stock => stock.id === id); if (!item) return;
  const linked = state.projects.some(project => (project.requirements || []).some(req => req.stockId === id && req.reservedQty > 0));
  if (linked) return toast('Ce stock est réservé par un projet. Libérez-le avant suppression.');
  if (!confirm(`Supprimer « ${item.name} » du stock ?`)) return;
  state.inventory = state.inventory.filter(stock => stock.id !== id); state.projects.forEach(project => (project.requirements || []).forEach(req => { if (req.stockId === id) req.stockId = null; })); await saveState(); render(); toast('Stock supprimé.');
}

function openFilamentModal(existing = null) {
  const data = existing || normalizeFilament({ material: 'PLA', initial_weight_g: 1000, remaining_weight_g: 1000, color_name: 'Blanc', color_hex: '#F2F0E8' });
  if (!data.code) data.code = nextFilamentCode();
  const isEdit = Boolean(existing);
  openModal(isEdit ? 'Modifier la bobine' : 'Ajouter une bobine', `<div class="form-grid two">
    <div class="field"><label for="filCode">Identifiant QR</label><input id="filCode" class="input" value="${escapeHtml(data.code)}" readonly><small>Unique et conservé pendant toute la vie de la bobine.</small></div>
    <div class="field"><label for="filBrand">Marque</label><input id="filBrand" class="input" value="${escapeHtml(data.brand)}"></div>
    <div class="field"><label for="filRange">Gamme</label><input id="filRange" class="input" value="${escapeHtml(data.range)}"></div>
    <div class="field"><label for="filMaterial">Matière</label><select id="filMaterial" class="select">${['PLA','PETG','ABS','ASA','TPU','PA','PC','Autre'].map(material => `<option ${data.material === material ? 'selected' : ''}>${material}</option>`).join('')}</select></div>
    <div class="field"><label for="filColorName">Couleur</label><input id="filColorName" class="input" value="${escapeHtml(data.colorName)}"></div>
    <div class="field"><label for="filColorHex">Teinte</label><input id="filColorHex" class="input" type="color" value="${escapeHtml(data.colorHex)}"></div>
    <div class="field"><label for="filInitial">Poids initial</label><div class="input-group"><input id="filInitial" class="input" type="number" value="${num(data.initialWeight)}"><span class="input-suffix">g</span></div></div>
    <div class="field"><label for="filRemaining">Poids restant</label><div class="input-group"><input id="filRemaining" class="input" type="number" value="${num(data.remainingWeight)}"><span class="input-suffix">g</span></div></div>
    <div class="field"><label for="filSpoolWeight">Poids de la bobine vide</label><div class="input-group"><input id="filSpoolWeight" class="input" type="number" value="${num(data.spoolWeight)}"><span class="input-suffix">g</span></div></div>
    <div class="field"><label for="filPrice">Prix d’achat</label><div class="input-group"><input id="filPrice" class="input" type="number" step="0.01" value="${num(data.price)}"><span class="input-suffix">€</span></div></div>
    <div class="field"><label for="filLocation">Emplacement</label><input id="filLocation" class="input" value="${escapeHtml(data.location)}"></div>
    <div class="field"><label for="filOpened">Date d’ouverture</label><input id="filOpened" class="input" type="date" value="${escapeHtml(data.openedAt)}"></div>
    <div class="field"><label for="filNozzle">Température buse</label><div class="input-group"><input id="filNozzle" class="input" type="number" value="${num(data.nozzle)}"><span class="input-suffix">°C</span></div></div>
    <div class="field"><label for="filBed">Température plateau</label><div class="input-group"><input id="filBed" class="input" type="number" value="${num(data.bed)}"><span class="input-suffix">°C</span></div></div>
    <div class="field" style="grid-column:1/-1"><label for="filNotes">Notes</label><textarea id="filNotes" class="textarea small-textarea">${escapeHtml(data.notes)}</textarea></div>
  </div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-save>${isEdit ? 'Enregistrer' : 'Ajouter'}</button>`, modal => {
    $('[data-cancel]', modal).addEventListener('click', closeModal);
    $('[data-save]', modal).addEventListener('click', async () => {
      const previous = existing ? existing.remainingWeight : 0;
      Object.assign(data, { code: normalizeFilamentCode($('#filCode', modal).value) || nextFilamentCode(), brand: $('#filBrand', modal).value.trim(), range: $('#filRange', modal).value.trim(), material: $('#filMaterial', modal).value, colorName: $('#filColorName', modal).value.trim() || 'Non précisée', colorHex: $('#filColorHex', modal).value, initialWeight: Math.max(1, num($('#filInitial', modal).value)), remainingWeight: Math.max(0, num($('#filRemaining', modal).value)), spoolWeight: Math.max(0, num($('#filSpoolWeight', modal).value)), price: Math.max(0, num($('#filPrice', modal).value)), location: $('#filLocation', modal).value.trim(), openedAt: $('#filOpened', modal).value, nozzle: num($('#filNozzle', modal).value), bed: num($('#filBed', modal).value), notes: $('#filNotes', modal).value.trim() });
      data.reservedWeight = clamp(num(data.reservedWeight), 0, data.remainingWeight);
      if (!existing) state.filaments.unshift(data);
      ensureFilamentCodes();
      const delta = data.remainingWeight - previous; if (delta) addMovement(existing ? 'adjustment' : 'addition', 'filament', data.id, Math.abs(delta), 'g', null, existing ? 'Poids ajusté' : `Bobine ajoutée — ${data.code}`);
      state.projects.forEach(project => rematchProjectRequirements(project, true)); await saveState(); closeModal(); render(); toast(isEdit ? 'Bobine modifiée.' : `Bobine ${data.code} ajoutée.`);
    });
  });
}

function openFilamentAdjustment(id) {
  const filament = state.filaments.find(item => item.id === id); if (!filament) return;
  const measuredDefault = filament.spoolWeight ? filament.remainingWeight + filament.spoolWeight : 0;
  openModal('Peser la bobine', `<div class="info-banner"><strong>${escapeHtml(filament.code)} — ${escapeHtml(filament.material)} ${escapeHtml(filament.colorName)}</strong><div class="small">Filament enregistré : ${decimal(filament.remainingWeight)} g, dont ${decimal(filament.reservedWeight)} g réservés.</div></div><div class="weight-mode-tabs"><button type="button" class="tab active" data-weight-mode="filament">Poids du filament</button><button type="button" class="tab" data-weight-mode="total">Poids bobine complète</button></div><div class="form-grid" style="margin-top:14px"><div class="field" data-filament-weight-field><label for="adjustFilamentQty">Nouveau poids de filament</label><div class="input-group"><input id="adjustFilamentQty" class="input" type="number" value="${num(filament.remainingWeight)}"><span class="input-suffix">g</span></div></div><div class="field hidden" data-total-weight-field><label for="adjustTotalWeight">Poids mesuré avec la bobine</label><div class="input-group"><input id="adjustTotalWeight" class="input" type="number" value="${num(measuredDefault)}"><span class="input-suffix">g</span></div><small>Poids bobine vide enregistré : ${filament.spoolWeight ? `${decimal(filament.spoolWeight)} g` : 'non renseigné'}.</small></div><div class="field"><label for="adjustFilamentNote">Motif</label><input id="adjustFilamentNote" class="input" placeholder="Pesée réelle, impression ratée…"></div></div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-save>Ajuster</button>`, modal => {
    let mode = 'filament';
    $$('[data-weight-mode]', modal).forEach(button => button.addEventListener('click', () => {
      mode = button.dataset.weightMode; $$('[data-weight-mode]', modal).forEach(item => item.classList.toggle('active', item === button));
      $('[data-filament-weight-field]', modal).classList.toggle('hidden', mode !== 'filament');
      $('[data-total-weight-field]', modal).classList.toggle('hidden', mode !== 'total');
    }));
    $('[data-cancel]', modal).addEventListener('click', closeModal);
    $('[data-save]', modal).addEventListener('click', async () => {
      if (mode === 'total' && !filament.spoolWeight) return toast('Renseignez d’abord le poids de la bobine vide dans la fiche.');
      const next = mode === 'total' ? Math.max(0, num($('#adjustTotalWeight', modal).value) - filament.spoolWeight) : Math.max(0, num($('#adjustFilamentQty', modal).value));
      if (next < filament.reservedWeight && !confirm('Le nouveau poids est inférieur au poids réservé. Réduire aussi la réservation ?')) return;
      const delta = next - filament.remainingWeight; filament.remainingWeight = next; filament.reservedWeight = Math.min(filament.reservedWeight, next); addMovement('adjustment', 'filament', filament.id, Math.abs(delta), 'g', null, $('#adjustFilamentNote', modal).value.trim() || (mode === 'total' ? 'Pesée de la bobine complète' : 'Pesée réelle')); await saveState(); closeModal(); render(); toast(`${filament.code} : poids ajusté à ${decimal(next)} g.`);
    });
  });
}

function renderFilamentQr(target, filament, size = 220) {
  target.innerHTML = '';
  new QRCode(target, { text: filamentQrPayload(filament), width: size, height: size, colorDark: '#111111', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
}

function openFilamentQuickView(id) {
  const filament = state.filaments.find(item => item.id === id); if (!filament) return;
  const available = filamentAvailable(filament);
  openModal(`Bobine ${filament.code}`, `<div class="filament-quick"><div class="qr-label-preview"><div class="qr-label-text"><strong>${escapeHtml(filament.material)} — ${escapeHtml(filament.colorName)}</strong><span>${escapeHtml(filament.brand || 'Sans marque')} ${escapeHtml(filament.range || '')}</span><b>${escapeHtml(filament.code)}</b></div><div id="filamentQrCode" class="qr-code"></div></div><div class="stock-stat-grid"><div class="stock-stat"><span>Restant</span><strong>${decimal(filament.remainingWeight)} g</strong></div><div class="stock-stat"><span>Disponible</span><strong>${decimal(available)} g</strong></div><div class="stock-stat"><span>Réservé</span><strong>${decimal(filament.reservedWeight)} g</strong></div><div class="stock-stat"><span>Emplacement</span><strong style="font-size:.86rem">${escapeHtml(filament.location || '—')}</strong></div></div><div class="small qr-payload-note">Le QR contient uniquement l’adresse de l’application et l’identifiant ${escapeHtml(filament.code)}.</div></div>`, `<button class="btn btn-ghost" data-edit>Modifier</button><button class="btn btn-outline" data-weigh>Peser</button><button class="btn btn-secondary" data-print>Imprimer l’étiquette</button>`, modal => {
    renderFilamentQr($('#filamentQrCode', modal), filament, 190);
    $('[data-edit]', modal).addEventListener('click', () => { closeModal(); openFilamentModal(filament); });
    $('[data-weigh]', modal).addEventListener('click', () => { closeModal(); openFilamentAdjustment(filament.id); });
    $('[data-print]', modal).addEventListener('click', () => printFilamentLabel(filament));
  });
}

function printFilamentLabel(filament) {
  const image = qrToDataUrl(filamentQrPayload(filament), 360);
  const win = window.open('', '_blank', 'width=700,height=500');
  if (!win) return toast('Autorisez les fenêtres contextuelles pour imprimer.');
  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${filament.code}</title><style>@page{size:50mm 30mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}.label{width:50mm;height:30mm;padding:2.2mm;display:grid;grid-template-columns:25mm 1fr;gap:2mm;align-items:center;border:.25mm solid #222}.label img{width:24mm;height:24mm;image-rendering:pixelated}.txt{min-width:0}.mat{font-size:12pt;font-weight:800}.color{font-size:9pt;margin-top:1mm}.brand{font-size:7.5pt;margin-top:1mm}.code{font-size:11pt;font-weight:900;margin-top:2mm;letter-spacing:.5px}</style></head><body><div class="label"><img src="${image}" alt="QR"><div class="txt"><div class="mat">${escapeHtml(filament.material)}</div><div class="color">${escapeHtml(filament.colorName)}</div><div class="brand">${escapeHtml([filament.brand, filament.range].filter(Boolean).join(' '))}</div><div class="code">${escapeHtml(filament.code)}</div></div></div><script>window.onload=()=>{window.print()}<\/script></body></html>`);
  win.document.close();
}

function printAllFilamentLabels() {
  if (!state.filaments.length) return toast('Aucune bobine à étiqueter.');
  const win = window.open('', '_blank', 'width=950,height=800');
  if (!win) return toast('Autorisez les fenêtres contextuelles pour imprimer.');
  const labels = state.filaments.map(filament => {
    const image = qrToDataUrl(filamentQrPayload(filament), 280);
    return `<div class="label"><img src="${image}" alt="QR"><div class="txt"><div class="mat">${escapeHtml(filament.material)}</div><div class="color">${escapeHtml(filament.colorName)}</div><div class="brand">${escapeHtml([filament.brand, filament.range].filter(Boolean).join(' '))}</div><div class="code">${escapeHtml(filament.code)}</div></div></div>`;
  }).join('');
  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Étiquettes bobines Atelier 2.0</title><style>@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}.sheet{display:grid;grid-template-columns:repeat(3,50mm);gap:5mm;align-content:start}.label{width:50mm;height:30mm;padding:2mm;display:grid;grid-template-columns:24mm 1fr;gap:2mm;align-items:center;border:.25mm solid #222;break-inside:avoid}.label img{width:23mm;height:23mm;image-rendering:pixelated}.mat{font-size:11pt;font-weight:800}.color{font-size:8.5pt;margin-top:.7mm}.brand{font-size:7pt;margin-top:.7mm}.code{font-size:10pt;font-weight:900;margin-top:1.5mm}</style></head><body><div class="sheet">${labels}</div><script>window.onload=()=>{window.print()}<\/script></body></html>`);
  win.document.close();
}

function openFilamentScanner() {
  const qrDecoderAvailable = typeof window.jsQR === 'function';
  const cameraAvailable = Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia && qrDecoderAvailable);
  const imageReaderAvailable = qrDecoderAvailable;
  const initialStatus = cameraAvailable
    ? 'Caméra compatible Safari prête à être démarrée.'
    : (window.location.protocol === 'file:'
      ? 'Le scan en direct nécessite la version GitHub Pages en HTTPS. La lecture depuis une photo reste disponible.'
      : (!qrDecoderAvailable
        ? 'Le lecteur QR n’a pas pu être chargé. Vérifiez la connexion puis rechargez la page.'
        : 'La caméra n’est pas accessible. Utilisez une photo ou le code manuel.'));

  openModal('Scanner une bobine', `<div class="info-banner"><strong>Accès rapide à une bobine</strong><div class="small">Scannez son QR code, prenez une photo ou saisissez l’identifiant imprimé sous le code.</div></div><div class="scanner-panel"><video id="qrScannerVideo" playsinline muted autoplay></video><canvas id="qrScannerCanvas" hidden></canvas><div id="qrScannerStatus" class="small">${initialStatus}</div></div><div class="form-grid"><div class="field"><label for="filamentCodeLookup">Identifiant de la bobine</label><input id="filamentCodeLookup" class="input" placeholder="FIL-0001" autocomplete="off" autocapitalize="characters"></div><div class="field"><label for="qrImageFile">Lire une photo du QR</label><input id="qrImageFile" class="input" type="file" accept="image/*" capture="environment" ${imageReaderAvailable ? '' : 'disabled'}><div class="small">Sur iPhone, ce bouton peut aussi ouvrir directement l’appareil photo.</div></div></div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button>${cameraAvailable ? '<button class="btn btn-outline" data-camera>Démarrer la caméra</button>' : ''}<button class="btn btn-primary" data-find>Ouvrir la bobine</button>`, modal => {
    const status = $('#qrScannerStatus', modal);
    const video = $('#qrScannerVideo', modal);
    const canvas = $('#qrScannerCanvas', modal);
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const openFromValue = value => {
      const filament = filamentByCode(value);
      if (!filament) return toast(`Aucune bobine trouvée pour ${parseFilamentCode(value) || 'ce code'}.`);
      status.textContent = `Bobine ${filament.code} détectée.`;
      closeModal();
      setTimeout(() => openFilamentQuickView(filament.id), 40);
    };

    const decodeCanvas = () => {
      if (!qrDecoderAvailable || !canvas.width || !canvas.height) return null;
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      return window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
    };

    const drawSourceToCanvas = (source, sourceWidth, sourceHeight, maxSize = 1200) => {
      if (!sourceWidth || !sourceHeight) return false;
      const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      return true;
    };

    $('[data-cancel]', modal).addEventListener('click', closeModal);
    $('[data-find]', modal).addEventListener('click', () => openFromValue($('#filamentCodeLookup', modal).value));
    $('#filamentCodeLookup', modal).addEventListener('keydown', event => { if (event.key === 'Enter') openFromValue(event.target.value); });

    $('[data-camera]', modal)?.addEventListener('click', async event => {
      const button = event.currentTarget;
      try {
        stopQrScanner();
        button.disabled = true;
        status.textContent = 'Ouverture de la caméra arrière…';
        const preferredConstraints = { video: { facingMode: { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
        const fallbackConstraints = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
        try {
          activeScannerStream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
        } catch (firstError) {
          activeScannerStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        }
        video.srcObject = activeScannerStream;
        await video.play();
        status.textContent = 'Cadrez le QR code dans la zone. La détection est automatique.';
        button.textContent = 'Caméra active';

        let lastAnalysis = 0;
        const detect = timestamp => {
          if (!activeScannerStream || !document.body.contains(video)) return;
          if (timestamp - lastAnalysis >= 120 && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
            lastAnalysis = timestamp;
            try {
              if (drawSourceToCanvas(video, video.videoWidth, video.videoHeight, 900)) {
                const result = decodeCanvas();
                if (result?.data) {
                  status.textContent = 'QR détecté.';
                  openFromValue(result.data);
                  return;
                }
              }
            } catch (scanError) {}
          }
          activeScannerFrame = requestAnimationFrame(detect);
        };
        activeScannerFrame = requestAnimationFrame(detect);
      } catch (error) {
        stopQrScanner();
        button.disabled = false;
        button.textContent = 'Réessayer la caméra';
        const denied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError';
        status.textContent = denied
          ? 'Accès caméra refusé. Dans Safari, autorisez la caméra pour ce site, puis réessayez. Vous pouvez aussi prendre une photo ci-dessous.'
          : 'Impossible d’ouvrir la caméra. Utilisez une photo du QR ou la saisie manuelle.';
      }
    });

    $('#qrImageFile', modal).addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (!file || !imageReaderAvailable) return;
      status.textContent = 'Analyse de la photo…';
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        try {
          if (!drawSourceToCanvas(image, image.naturalWidth, image.naturalHeight, 1800)) throw new Error('Image vide');
          const result = decodeCanvas();
          if (!result?.data) {
            status.textContent = 'Aucun QR détecté. Recadrez davantage le code et reprenez une photo nette.';
            return toast('Aucun QR code détecté dans cette image.');
          }
          status.textContent = 'QR détecté dans la photo.';
          openFromValue(result.data);
        } catch (error) {
          status.textContent = 'Impossible de lire cette image.';
          toast('Impossible de lire cette image.');
        } finally {
          URL.revokeObjectURL(objectUrl);
          event.target.value = '';
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        event.target.value = '';
        status.textContent = 'Format d’image non pris en charge.';
        toast('Impossible d’ouvrir cette image.');
      };
      image.src = objectUrl;
    });
  });
}

function openDeepLinkedFilament() {
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return;
  const params = new URLSearchParams(window.location.search); const code = params.get('filament'); if (!code) return;
  const filament = filamentByCode(code);
  if (window.history?.replaceState) window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
  if (!filament) return toast(`La bobine ${parseFilamentCode(code)} n’existe pas sur cet appareil.`);
  state.ui.route = 'workshop'; state.ui.workshopTab = 'filaments'; render(); setTimeout(() => openFilamentQuickView(filament.id), 60);
}

async function deleteFilament(id) {
  const filament = state.filaments.find(item => item.id === id); if (!filament) return;
  const linked = state.projects.some(project => (project.requirements || []).some(req => req.filamentId === id && req.reservedQty > 0));
  if (linked) return toast('Cette bobine est réservée par un projet. Libérez-la avant suppression.');
  if (!confirm(`Supprimer la bobine ${filament.material} ${filament.colorName} ?`)) return;
  state.filaments = state.filaments.filter(item => item.id !== id); state.projects.forEach(project => (project.requirements || []).forEach(req => { if (req.filamentId === id) req.filamentId = null; })); await saveState(); render(); toast('Bobine supprimée.');
}

function openToolModal(existing = null) {
  const data = existing || normalizeTool({});
  openModal(existing ? 'Modifier l’outil' : 'Ajouter un outil', `<div class="form-grid"><div class="field"><label for="toolName">Nom *</label><input id="toolName" class="input" value="${escapeHtml(data.name)}" placeholder="Scie à onglet"></div><div class="field"><label for="toolCategory">Catégorie</label><input id="toolCategory" class="input" value="${escapeHtml(data.category)}" placeholder="Découpe"></div><div class="field"><label for="toolLocation">Emplacement</label><input id="toolLocation" class="input" value="${escapeHtml(data.location)}"></div><div class="field"><label for="toolNotes">Notes</label><textarea id="toolNotes" class="textarea small-textarea">${escapeHtml(data.notes)}</textarea></div></div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-save>Enregistrer</button>`, modal => {
    $('[data-cancel]', modal).addEventListener('click', closeModal);
    $('[data-save]', modal).addEventListener('click', async () => { const name = $('#toolName', modal).value.trim(); if (!name) return toast('Le nom est obligatoire.'); Object.assign(data, { name, category: $('#toolCategory', modal).value.trim() || 'Outillage', location: $('#toolLocation', modal).value.trim(), notes: $('#toolNotes', modal).value.trim() }); if (!existing) state.tools.unshift(data); await saveState(); closeModal(); render(); toast(existing ? 'Outil modifié.' : 'Outil ajouté.'); });
  });
}
async function deleteTool(id) { const tool = state.tools.find(item => item.id === id); if (!tool || !confirm(`Supprimer « ${tool.name} » ?`)) return; state.tools = state.tools.filter(item => item.id !== id); await saveState(); render(); toast('Outil supprimé.'); }

function openRequirementModal(id = null) {
  const project = selectedProject(); if (!project) return;
  const existing = id ? project.requirements.find(req => req.id === id) : null;
  const data = existing || normalizeRequirement({ stock_type: 'count', unit: 'pièce', required_quantity: 1 });
  openModal(existing ? 'Modifier le besoin' : 'Ajouter un besoin', `<div class="form-grid two">
    <div class="field" style="grid-column:1/-1"><label for="reqName">Désignation *</label><input id="reqName" class="input" value="${escapeHtml(data.name)}"></div>
    <div class="field"><label for="reqCategory">Catégorie</label><input id="reqCategory" class="input" value="${escapeHtml(data.category)}"></div>
    <div class="field"><label for="reqType">Type</label><select id="reqType" class="select">${STOCK_TYPES.map(([value,label]) => `<option value="${value}" ${data.stockType === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
    <div class="field"><label for="reqQty">Quantité prévue</label><input id="reqQty" class="input" type="number" step="0.01" value="${num(data.plannedQty)}"></div>
    <div class="field"><label for="reqUnit">Unité</label><input id="reqUnit" class="input" value="${escapeHtml(data.unit)}"></div>
    <div class="field"><label for="reqRequiredLength">Longueur totale nécessaire</label><div class="input-group"><input id="reqRequiredLength" class="input" type="number" value="${num(data.requiredLengthMm)}"><span class="input-suffix">mm</span></div></div>
    <div class="field"><label for="reqMaterial">Matière</label><input id="reqMaterial" class="input" value="${escapeHtml(data.material)}"></div>
    <div class="field"><label for="reqWidth">Largeur / section</label><div class="input-group"><input id="reqWidth" class="input" type="number" value="${num(data.widthMm)}"><span class="input-suffix">mm</span></div></div>
    <div class="field"><label for="reqThickness">Épaisseur / section</label><div class="input-group"><input id="reqThickness" class="input" type="number" value="${num(data.thicknessMm)}"><span class="input-suffix">mm</span></div></div>
    <div class="field"><label for="reqColor">Couleur</label><input id="reqColor" class="input" value="${escapeHtml(data.color)}"></div>
    <div class="field" style="grid-column:1/-1"><label for="reqNotes">Notes</label><textarea id="reqNotes" class="textarea small-textarea">${escapeHtml(data.notes)}</textarea></div>
  </div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-save>Enregistrer</button>`, modal => {
    $('[data-cancel]', modal).addEventListener('click', closeModal);
    $('[data-save]', modal).addEventListener('click', async () => {
      const name = $('#reqName', modal).value.trim(); if (!name) return toast('La désignation est obligatoire.');
      if (existing?.reservedQty > 0 && !confirm('Ce besoin est déjà réservé. La modification libérera sa réservation actuelle. Continuer ?')) return;
      if (existing?.reservedQty > 0) releaseSingleRequirement(project, existing);
      Object.assign(data, { name, category: $('#reqCategory', modal).value.trim() || inferCategory(name), stockType: $('#reqType', modal).value, plannedQty: Math.max(0, num($('#reqQty', modal).value)), unit: $('#reqUnit', modal).value.trim() || defaultUnit($('#reqType', modal).value), requiredLengthMm: Math.max(0, num($('#reqRequiredLength', modal).value)), material: $('#reqMaterial', modal).value.trim(), widthMm: Math.max(0, num($('#reqWidth', modal).value)), thicknessMm: Math.max(0, num($('#reqThickness', modal).value)), color: $('#reqColor', modal).value.trim(), notes: $('#reqNotes', modal).value.trim(), stockId: null, filamentId: null, reservedQty: 0, reservationUnit: '' });
      if (!existing) project.requirements.push(data); rematchProjectRequirements(project, true); project.updatedAt = new Date().toISOString(); await saveState(); closeModal(); render(); toast('Besoin enregistré.');
    });
  });
}

function releaseSingleRequirement(project, req) {
  if (!req.reservedQty) return;
  if (req.filamentId) { const filament = state.filaments.find(item => item.id === req.filamentId); if (filament) filament.reservedWeight = Math.max(0, filament.reservedWeight - req.reservedQty); }
  if (req.stockId) { const item = state.inventory.find(stock => stock.id === req.stockId); if (item) item.reserved = Math.max(0, item.reserved - req.reservedQty); }
  req.reservedQty = 0; req.reservationUnit = '';
}

async function deleteRequirement(id) {
  const project = selectedProject(); const req = project?.requirements.find(item => item.id === id); if (!project || !req) return;
  if (!confirm(`Supprimer le besoin « ${req.name} » ?`)) return; releaseSingleRequirement(project, req); project.requirements = project.requirements.filter(item => item.id !== id); project.updatedAt = new Date().toISOString(); await saveState(); render(); toast('Besoin supprimé.');
}

function openPieceModal(id = null) {
  const project = selectedProject(); if (!project) return;
  const existing = id ? project.pieces.find(item => item.id === id) : null;
  const data = existing || { id: uid('piece'), ref: String.fromCharCode(65 + (project.pieces?.length || 0)), name: '', type: 'Découpe bois', material: '', length: 0, width: 0, thickness: 0, qty: 1, status: 'À fabriquer', unitCost: 0 };
  openModal(existing ? 'Modifier la pièce' : 'Ajouter une pièce', `<div class="form-grid two"><div class="field"><label for="pieceRef">Repère</label><input id="pieceRef" class="input" value="${escapeHtml(data.ref)}"></div><div class="field"><label for="pieceName">Nom *</label><input id="pieceName" class="input" value="${escapeHtml(data.name)}"></div><div class="field"><label for="pieceType">Fabrication</label><select id="pieceType" class="select">${['Découpe bois','Impression 3D','Achetée','Réemployée','Fabrication manuelle'].map(type => `<option ${data.type === type ? 'selected' : ''}>${type}</option>`).join('')}</select></div><div class="field"><label for="pieceMaterial">Matériau</label><input id="pieceMaterial" class="input" value="${escapeHtml(data.material)}"></div><div class="field"><label for="pieceLength">Longueur</label><input id="pieceLength" class="input" type="number" value="${num(data.length)}"></div><div class="field"><label for="pieceWidth">Largeur</label><input id="pieceWidth" class="input" type="number" value="${num(data.width)}"></div><div class="field"><label for="pieceThickness">Épaisseur</label><input id="pieceThickness" class="input" type="number" value="${num(data.thickness)}"></div><div class="field"><label for="pieceQty">Quantité</label><input id="pieceQty" class="input" type="number" min="1" value="${num(data.qty)}"></div><div class="field"><label for="pieceStatus">Statut</label><select id="pieceStatus" class="select">${['À fabriquer','En cours','Fabriquée','À acheter'].map(status => `<option ${data.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></div><div class="field"><label for="pieceCost">Coût unitaire</label><input id="pieceCost" class="input" type="number" step="0.01" value="${num(data.unitCost)}"></div></div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-save>Enregistrer</button>`, modal => {
    $('[data-cancel]', modal).addEventListener('click', closeModal); $('[data-save]', modal).addEventListener('click', async () => { const name = $('#pieceName', modal).value.trim(); if (!name) return toast('Le nom est obligatoire.'); Object.assign(data, { ref: $('#pieceRef', modal).value.trim() || '?', name, type: $('#pieceType', modal).value, material: $('#pieceMaterial', modal).value.trim(), length: num($('#pieceLength', modal).value), width: num($('#pieceWidth', modal).value), thickness: num($('#pieceThickness', modal).value), qty: Math.max(1, Math.round(num($('#pieceQty', modal).value))), status: $('#pieceStatus', modal).value, unitCost: Math.max(0, num($('#pieceCost', modal).value)) }); if (!existing) project.pieces.push(data); project.cutPlan = null; project.updatedAt = new Date().toISOString(); await saveState(); closeModal(); render(); toast('Pièce enregistrée.'); });
  });
}

function openBarModal() {
  const project = selectedProject(); if (!project) return;
  openModal('Ajouter des barres au calcul', `<div class="form-grid two"><div class="field"><label for="barLabel">Désignation</label><input id="barLabel" class="input" placeholder="Tasseau 35 × 60"></div><div class="field"><label for="barLength">Longueur</label><div class="input-group"><input id="barLength" class="input" type="number" value="3000"><span class="input-suffix">mm</span></div></div><div class="field"><label for="barQty">Quantité</label><input id="barQty" class="input" type="number" value="1"></div><div class="field"><label for="barKerf">Trait de scie</label><div class="input-group"><input id="barKerf" class="input" type="number" value="3"><span class="input-suffix">mm</span></div></div></div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-save>Ajouter</button>`, modal => {
    $('[data-cancel]', modal).addEventListener('click', closeModal); $('[data-save]', modal).addEventListener('click', async () => { project.stockBars.push({ id: uid('bar'), sourceStockId: null, label: $('#barLabel', modal).value.trim() || 'Barre', length: Math.max(0, num($('#barLength', modal).value)), qty: Math.max(1, Math.round(num($('#barQty', modal).value))), kerf: Math.max(0, num($('#barKerf', modal).value)) }); project.cutPlan = null; await saveState(); closeModal(); render(); toast('Barres ajoutées.'); });
  });
}
async function deleteBar(id) { const project = selectedProject(); if (!project) return; project.stockBars = project.stockBars.filter(item => item.id !== id); project.cutPlan = null; await saveState(); render(); }
function loadSelectedProjectBars() { const project = selectedProject(); if (!project) return; loadProjectBarsFromMatches(project, false); saveState(); render(); toast(project.stockBars.length ? 'Barres chargées depuis l’inventaire.' : 'Aucune barre rapprochée dans l’inventaire.'); }

function optimizeCuts() {
  const project = selectedProject(); if (!project) return;
  const cuts = (project.pieces || []).filter(piece => piece.type === 'Découpe bois' && num(piece.length) > 0).flatMap(piece => Array.from({ length: Math.max(1, Math.round(num(piece.qty))) }, () => ({ ref: piece.ref, name: piece.name, length: num(piece.length) }))).sort((a,b) => b.length - a.length);
  const stock = (project.stockBars || []).flatMap(bar => Array.from({ length: Math.max(1, Math.round(num(bar.qty))) }, () => ({ label: bar.label, length: num(bar.length), kerf: num(bar.kerf), used: 0, items: [] })));
  if (!cuts.length || !stock.length) { project.cutPlan = { error: 'Ajoutez au moins une pièce à découper et une barre disponible.' }; saveState(); render(); return; }
  const bars = stock.sort((a,b) => a.length - b.length); const unplaced = [];
  cuts.forEach(cut => {
    const candidate = bars.filter(bar => bar.length - bar.used >= cut.length + (bar.items.length ? bar.kerf : 0)).sort((a,b) => (a.length - a.used) - (b.length - b.used))[0];
    if (!candidate) { unplaced.push(cut); return; }
    const extraKerf = candidate.items.length ? candidate.kerf : 0; candidate.used += cut.length + extraKerf; candidate.items.push(cut);
  });
  const usedBars = bars.filter(bar => bar.items.length); const total = usedBars.reduce((sum,bar) => sum + bar.length, 0); const used = usedBars.reduce((sum,bar) => sum + bar.used, 0);
  project.cutPlan = { bars: usedBars, unplaced, wastePercent: total ? (total - used) / total * 100 : 0 }; saveState(); render(); toast('Plan de coupe calculé.');
}

function openPrintModal(id = null) {
  const project = selectedProject(); if (!project) return;
  const existing = id ? project.prints.find(item => item.id === id) : null;
  const data = existing || { id: uid('print'), name: '', qty: 1, material: 'PLA', color: '', filamentId: null, weight: 0, duration: 0, status: 'À imprimer' };
  openModal(existing ? 'Modifier l’impression' : 'Ajouter une impression', `<div class="form-grid two"><div class="field" style="grid-column:1/-1"><label for="printName">Nom *</label><input id="printName" class="input" value="${escapeHtml(data.name)}"></div><div class="field"><label for="printQty">Quantité</label><input id="printQty" class="input" type="number" min="1" value="${num(data.qty)}"></div><div class="field"><label for="printWeight">Poids total</label><div class="input-group"><input id="printWeight" class="input" type="number" value="${num(data.weight)}"><span class="input-suffix">g</span></div></div><div class="field"><label for="printDuration">Durée totale</label><div class="input-group"><input id="printDuration" class="input" type="number" step="0.1" value="${num(data.duration)}"><span class="input-suffix">h</span></div></div><div class="field"><label for="printStatus">Statut</label><select id="printStatus" class="select">${['À imprimer','En impression','Imprimée','Échec'].map(status => `<option ${data.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></div><div class="field" style="grid-column:1/-1"><label for="printFilament">Bobine</label><select id="printFilament" class="select"><option value="">Aucune bobine liée</option>${state.filaments.map(item => `<option value="${item.id}" ${data.filamentId === item.id ? 'selected' : ''}>${escapeHtml(item.material)} ${escapeHtml(item.colorName)} — ${decimal(filamentAvailable(item))} g disponibles</option>`).join('')}</select></div></div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-save>Enregistrer</button>`, modal => {
    $('[data-cancel]', modal).addEventListener('click', closeModal); $('[data-save]', modal).addEventListener('click', async () => { const name = $('#printName', modal).value.trim(); if (!name) return toast('Le nom est obligatoire.'); const filamentId = $('#printFilament', modal).value || null; const filament = state.filaments.find(item => item.id === filamentId); Object.assign(data, { name, qty: Math.max(1, Math.round(num($('#printQty', modal).value))), weight: Math.max(0, num($('#printWeight', modal).value)), duration: Math.max(0, num($('#printDuration', modal).value)), status: $('#printStatus', modal).value, filamentId, material: filament?.material || data.material, color: filament?.colorName || data.color }); if (!existing) project.prints.push(data); project.updatedAt = new Date().toISOString(); await saveState(); closeModal(); render(); toast('Impression enregistrée.'); });
  });
}

function openStepModal(id = null) {
  const project = selectedProject(); if (!project) return;
  const existing = id ? project.steps.find(item => item.id === id) : null; const data = existing || { id: uid('step'), title: '', description: '', done: false };
  openModal(existing ? 'Modifier l’étape' : 'Ajouter une étape', `<div class="form-grid"><div class="field"><label for="stepTitle">Titre *</label><input id="stepTitle" class="input" value="${escapeHtml(data.title)}"></div><div class="field"><label for="stepDescription">Description</label><textarea id="stepDescription" class="textarea">${escapeHtml(data.description)}</textarea></div></div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-save>Enregistrer</button>`, modal => { $('[data-cancel]', modal).addEventListener('click', closeModal); $('[data-save]', modal).addEventListener('click', async () => { const title = $('#stepTitle', modal).value.trim(); if (!title) return toast('Le titre est obligatoire.'); data.title = title; data.description = $('#stepDescription', modal).value.trim(); if (!existing) project.steps.push(data); project.updatedAt = new Date().toISOString(); await saveState(); closeModal(); render(); toast('Étape enregistrée.'); }); });
}
async function toggleStep(id, done) { const project = selectedProject(); const step = project?.steps.find(item => item.id === id); if (!step) return; step.done = done; project.updatedAt = new Date().toISOString(); await saveState(); render(); }

function openExpenseModal(id = null) {
  const project = selectedProject(); if (!project) return; const existing = id ? project.expenses.find(item => item.id === id) : null; const data = existing || { id: uid('expense'), label: '', category: 'Autre', amount: 0 };
  openModal(existing ? 'Modifier la dépense' : 'Ajouter une dépense', `<div class="form-grid"><div class="field"><label for="expenseLabel">Libellé *</label><input id="expenseLabel" class="input" value="${escapeHtml(data.label)}"></div><div class="field"><label for="expenseCategory">Catégorie</label><input id="expenseCategory" class="input" value="${escapeHtml(data.category)}"></div><div class="field"><label for="expenseAmount">Montant</label><div class="input-group"><input id="expenseAmount" class="input" type="number" step="0.01" value="${num(data.amount)}"><span class="input-suffix">€</span></div></div></div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-save>Enregistrer</button>`, modal => { $('[data-cancel]', modal).addEventListener('click', closeModal); $('[data-save]', modal).addEventListener('click', async () => { const label = $('#expenseLabel', modal).value.trim(); if (!label) return toast('Le libellé est obligatoire.'); Object.assign(data, { label, category: $('#expenseCategory', modal).value.trim() || 'Autre', amount: Math.max(0, num($('#expenseAmount', modal).value)) }); if (!existing) project.expenses.push(data); project.updatedAt = new Date().toISOString(); await saveState(); closeModal(); render(); toast('Dépense enregistrée.'); }); });
}

async function rematchSelectedProject() { const project = selectedProject(); if (!project) return; rematchProjectRequirements(project, true); await saveState(); render(); toast('Rapprochement du stock actualisé.'); }
async function reserveSelectedProject() { const project = selectedProject(); if (!project) return; reserveProjectStock(project); if (project.status === 'Brouillon') project.status = 'En préparation'; await saveState(); render(); }
async function releaseSelectedProject() { const project = selectedProject(); if (!project || !confirm('Libérer toutes les réservations de ce projet ?')) return; releaseProjectStock(project); await saveState(); render(); }

function openCompleteProjectModal() {
  const project = selectedProject(); if (!project) return;
  const rows = (project.requirements || []).map((req,index) => {
    const source = requirementSource(req); const defaultActual = req.reservedQty || plannedReservation(req, source.item);
    const linear = source.type === 'inventory' && source.item?.stockType === 'linear';
    return `<article class="complete-item" data-complete-row="${index}"><h3>${escapeHtml(req.name)}</h3><div class="meta">Prévu : ${requirementPlannedLabel(req)} • Réservé : ${requirementReservedLabel(req)}</div>${source.item ? `<div class="requirement-match"><strong>Stock lié : ${escapeHtml(source.type === 'filament' ? `${source.item.material} ${source.item.colorName}` : source.item.name)}</strong><div>${source.type === 'filament' ? `${decimal(source.item.remainingWeight)} g physiquement enregistrés` : `${decimal(source.item.quantity)} ${escapeHtml(source.item.unit)} physiquement enregistrés`}</div></div>` : '<div class="requirement-match missing">Aucun stock lié : aucune déduction automatique.</div>'}
      <div class="form-grid two"><div class="field"><label>Consommation réelle</label><input class="input" type="number" step="0.01" data-actual value="${num(defaultActual)}"></div><div class="field"><label>Unité déduite</label><input class="input" data-actual-unit value="${escapeHtml(source.type === 'filament' ? 'g' : source.item?.unit || req.unit)}" readonly></div></div>
      ${linear ? `<div class="scrap-fields"><label class="check-label"><input type="checkbox" class="check" data-add-scrap> Ajouter une chute récupérable</label><div class="form-grid two" data-scrap-fields style="display:none;margin-top:10px"><div class="field"><label>Longueur de la chute</label><div class="input-group"><input class="input" type="number" data-scrap-length value="0"><span class="input-suffix">mm</span></div></div><div class="field"><label>Quantité de chutes</label><input class="input" type="number" data-scrap-qty value="1"></div></div></div>` : ''}</article>`;
  }).join('');
  openModal('Terminer le projet', `<div class="info-banner"><strong>Vérifiez la consommation réelle</strong><div class="small">Les réservations seront libérées, les quantités réellement utilisées seront déduites et les chutes indiquées seront ajoutées à l’inventaire.</div></div><div class="complete-grid" style="margin-top:14px">${rows || '<div class="empty-state"><strong>Aucun besoin matière</strong>Le projet peut être terminé sans mouvement de stock.</div>'}</div><div class="field" style="margin-top:14px"><label for="completionNote">Note de fin de projet</label><textarea id="completionNote" class="textarea small-textarea" placeholder="Modifications réalisées, erreurs de coupe, impressions ratées…"></textarea></div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-confirm>Valider et mettre à jour le stock</button>`, modal => {
    $$('[data-add-scrap]', modal).forEach(check => check.addEventListener('change', () => { $('[data-scrap-fields]', check.closest('[data-complete-row]')).style.display = check.checked ? 'grid' : 'none'; }));
    $('[data-cancel]', modal).addEventListener('click', closeModal);
    $('[data-confirm]', modal).addEventListener('click', () => completeProjectFromModal(project, modal));
  });
}

async function completeProjectFromModal(project, modal) {
  const consumption = [];
  const rows = $$('[data-complete-row]', modal);
  for (const row of rows) {
    const index = num(row.dataset.completeRow); const req = project.requirements[index]; if (!req) continue;
    const source = requirementSource(req); const actual = Math.max(0, num($('[data-actual]', row).value));
    if (source.type === 'filament' && actual > source.item.remainingWeight) return toast(`Stock insuffisant pour ${req.name}.`);
    if (source.type === 'inventory' && actual > source.item.quantity) return toast(`Stock insuffisant pour ${req.name}.`);
    consumption.push({ id: uid('consumption'), requirementId: req.id, name: req.name, actualQty: actual, unit: source.type === 'filament' ? 'g' : source.item?.unit || req.unit, sourceType: source.type, sourceId: source.item?.id || null, plannedQty: req.plannedQty, reservedQty: req.reservedQty });
    if (source.type === 'filament') {
      source.item.reservedWeight = Math.max(0, source.item.reservedWeight - req.reservedQty);
      source.item.remainingWeight = Math.max(0, source.item.remainingWeight - actual);
      addMovement('consumption', 'filament', source.item.id, actual, 'g', project.id, `Fin du projet ${project.name}`);
    }
    if (source.type === 'inventory') {
      source.item.reserved = Math.max(0, source.item.reserved - req.reservedQty);
      source.item.quantity = Math.max(0, source.item.quantity - actual);
      addMovement('consumption', 'inventory', source.item.id, actual, source.item.unit, project.id, `Fin du projet ${project.name}`);
      const addScrap = $('[data-add-scrap]', row)?.checked;
      const scrapLength = Math.max(0, num($('[data-scrap-length]', row)?.value)); const scrapQty = Math.max(0, Math.round(num($('[data-scrap-qty]', row)?.value)));
      if (addScrap && scrapLength > 0 && scrapQty > 0) {
        const scrap = normalizeInventoryItem({ category: source.item.category, name: `Chute — ${source.item.name}`, material: source.item.material, stock_type: 'linear', unit: source.item.unit, quantity: scrapQty, length_mm: scrapLength, width_mm: source.item.widthMm, thickness_mm: source.item.thicknessMm, location: source.item.location, unit_cost: 0, notes: `Récupérée sur le projet ${project.name}` });
        state.inventory.unshift(scrap); addMovement('scrap', 'inventory', scrap.id, scrapQty, scrap.unit, project.id, `${scrapLength} mm par chute`);
      }
    }
    req.reservedQty = 0; req.reservationUnit = '';
  }
  project.actualConsumption = consumption;
  project.status = 'Terminé'; project.completedAt = new Date().toISOString(); project.updatedAt = new Date().toISOString(); project.completionNote = $('#completionNote', modal).value.trim();
  await saveState(); closeModal(); render(); toast('Projet terminé et stock mis à jour.');
}

function openConsumptionModal() {
  const project = selectedProject(); if (!project) return;
  const list = (project.actualConsumption || []).map(item => `<div class="list-row"><div><strong>${escapeHtml(item.name)}</strong><div class="small">Prévu : ${decimal(item.plannedQty)} • Réservé : ${decimal(item.reservedQty)}</div></div><strong>${decimal(item.actualQty)} ${escapeHtml(item.unit)}</strong></div>`).join('');
  openModal('Consommation réelle', `${list || '<div class="empty-state"><strong>Aucune consommation enregistrée</strong></div>'}${project.completionNote ? `<div class="info-banner" style="margin-top:14px"><strong>Note</strong><div class="small">${escapeHtml(project.completionNote)}</div></div>` : ''}`);
}

function unwrapImportPayload(parsed, expectedType) {
  if (!parsed || typeof parsed !== 'object') throw new Error('Le fichier ne contient pas un objet JSON.');
  const type = String(parsed.type || parsed.data_type || '').toLowerCase();
  if (expectedType === 'project') {
    if (type && !['project','projet'].includes(type)) throw new Error('Ce fichier n’est pas un projet Atelier 2.0.');
    const raw = parsed.project || parsed.data?.project || parsed;
    if (!raw.name && !raw.title) throw new Error('Le nom du projet est manquant.');
    return normalizeProject(raw);
  }
  if (expectedType === 'inventory') {
    if (type && !['inventory','inventaire','stock'].includes(type)) throw new Error('Ce fichier n’est pas un inventaire Atelier 2.0.');
    const raw = parsed.inventory || parsed.data?.inventory || parsed;
    return {
      items: (raw.items || raw.stock || raw.materials || []).map(normalizeInventoryItem),
      filaments: (raw.filaments || raw.spools || raw.bobines || []).map(normalizeFilament),
      tools: (raw.tools || raw.outillage || []).map(normalizeTool),
      machines: (raw.machines || raw.equipment || raw.machines_atelier || []).map(normalizeMachine),
      workshopMap: raw.workshop_map || raw.workshopMap ? normalizeWorkshopMap(raw.workshop_map || raw.workshopMap) : null
    };
  }
  throw new Error('Type d’import inconnu.');
}

async function handleProjectFile(file) {
  try { const parsed = JSON.parse(await file.text()); const project = unwrapImportPayload(parsed, 'project'); rematchProjectRequirements(project, false); openProjectImportPreview(project); }
  catch (error) { toast(error.message || 'Fichier projet invalide.'); }
  $('#projectImportInput').value = '';
}

function openProjectImportPreview(project) {
  const requirements = project.requirements || []; const matched = requirements.filter(req => req.stockId || req.filamentId).length;
  const preview = requirements.slice(0,8).map(req => `<div class="import-preview-row"><div><strong>${escapeHtml(req.name)}</strong><small>${requirementPlannedLabel(req)}</small></div><span class="badge ${req.stockId || req.filamentId ? 'success' : 'danger'}">${req.stockId || req.filamentId ? 'Stock trouvé' : 'À acheter'}</span></div>`).join('');
  openModal('Aperçu du projet importé', `<div class="summary-grid"><section class="card"><span class="badge">${escapeHtml(project.category)}</span><h2>${escapeHtml(project.name)}</h2><p class="meta">${escapeHtml(project.description || 'Aucune description')}</p><div class="kv-grid"><div class="kv"><span>Dimensions</span><strong>${integer(project.width)} × ${integer(project.depth)} × ${integer(project.height)} mm</strong></div><div class="kv"><span>Pièces</span><strong>${project.pieces.length}</strong></div><div class="kv"><span>Étapes</span><strong>${project.steps.length}</strong></div><div class="kv"><span>Stock rapproché</span><strong>${matched}/${requirements.length}</strong></div></div></section><section class="card"><h3 style="margin-top:0">Besoins détectés</h3><div class="import-preview-list">${preview || '<div class="empty-state"><strong>Aucun besoin matière</strong></div>'}</div></section></div><label class="check-label" style="margin-top:15px"><input type="checkbox" class="check" id="reserveOnImport" checked> Réserver automatiquement le stock disponible</label><div class="info-banner" style="margin-top:12px"><strong>Vous gardez le contrôle</strong><div class="small">Toutes les informations pourront être modifiées après l’import. Les besoins non trouvés resteront visibles comme achats à prévoir.</div></div>`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-confirm>Importer le projet</button>`, modal => {
    $('[data-cancel]', modal).addEventListener('click', closeModal);
    $('[data-confirm]', modal).addEventListener('click', async () => {
      project.id = uid('project'); project.createdAt = new Date().toISOString(); project.updatedAt = project.createdAt; project.requirements.forEach(req => { req.id = uid('req'); req.reservedQty = 0; req.reservationUnit = ''; });
      project.pieces.forEach(item => item.id = uid('piece')); project.steps.forEach(item => item.id = uid('step')); project.prints.forEach(item => item.id = uid('print')); project.expenses.forEach(item => item.id = uid('expense'));
      state.projects.unshift(project); if ($('#reserveOnImport', modal).checked) reserveProjectStock(project, false); state.ui.selectedProjectId = project.id; state.ui.projectTab = 'summary'; await saveState(); closeModal(); navigate('project', { projectId: project.id }); toast('Projet importé.');
    });
  });
}

async function handleInventoryFile(file) {
  try { const parsed = JSON.parse(await file.text()); const inventory = unwrapImportPayload(parsed, 'inventory'); openInventoryImportPreview(inventory); }
  catch (error) { toast(error.message || 'Fichier inventaire invalide.'); }
  $('#inventoryImportInput').value = '';
}

function openInventoryImportPreview(inventory) {
  inventory.machines = inventory.machines || [];
  const total = inventory.items.length + inventory.filaments.length + inventory.tools.length + inventory.machines.length;
  const hasMap = Boolean(inventory.workshopMap && ((inventory.workshopMap.markers || []).length || inventory.workshopMap.backgroundImage));
  const previewRows = [...inventory.items.map(item => ({ name: item.name, sub: `${decimal(item.quantity)} ${item.unit} • ${formatDimensions(item)}`, kind: item.isScrap ? 'Chute' : 'Matériau' })), ...inventory.filaments.map(item => ({ name: `${item.material} ${item.colorName}`, sub: `${decimal(item.remainingWeight)} g • ${item.brand}`, kind: 'Bobine' })), ...inventory.machines.map(item => ({ name: item.name, sub: [item.brand,item.model,item.location].filter(Boolean).join(' • '), kind: 'Machine' })), ...inventory.tools.map(item => ({ name: item.name, sub: item.location || item.category, kind: 'Outil' }))].slice(0,12);
  openModal('Aperçu de l’inventaire', `<div class="metric-grid"><article class="metric-card"><span class="metric-label">Matériaux</span><strong class="metric-value">${inventory.items.length}</strong></article><article class="metric-card"><span class="metric-label">Bobines</span><strong class="metric-value">${inventory.filaments.length}</strong></article><article class="metric-card"><span class="metric-label">Machines</span><strong class="metric-value">${inventory.machines.length}</strong></article><article class="metric-card"><span class="metric-label">Outils</span><strong class="metric-value">${inventory.tools.length}</strong></article></div><div class="import-preview-list">${previewRows.map(row => `<div class="import-preview-row"><div><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.sub)}</small></div><span class="badge">${row.kind}</span></div>`).join('')}</div>${total > previewRows.length ? `<div class="small" style="margin-top:8px">+ ${total - previewRows.length} autre(s) élément(s)</div>` : ''}<label class="check-label" style="margin-top:15px"><input type="checkbox" class="check" id="mergeInventory" checked> Fusionner les références identiques</label>${hasMap?'<label class="check-label" style="margin-top:10px"><input type="checkbox" class="check" id="importWorkshopMap" checked> Importer également le plan de l’atelier</label>':''}`, `<button class="btn btn-ghost" data-cancel>Annuler</button><button class="btn btn-primary" data-confirm>Importer l’inventaire</button>`, modal => {
    $('[data-cancel]', modal).addEventListener('click', closeModal);
    $('[data-confirm]', modal).addEventListener('click', async () => { mergeInventoryData(inventory, $('#mergeInventory', modal).checked, hasMap && $('#importWorkshopMap', modal)?.checked); state.projects.forEach(project => rematchProjectRequirements(project, true)); await saveState(); closeModal(); navigate('inventory'); toast(`${total} élément(s) importé(s).`); });
  });
}

function mergeInventoryData(imported, merge, importMap = false) {
  imported.items.forEach(item => {
    const match = merge ? state.inventory.find(current => inventorySignature(current) === inventorySignature(item)) : null;
    if (match) { match.quantity += item.quantity; match.unitCost = item.unitCost || match.unitCost; match.location = item.location || match.location; match.isScrap = item.isScrap || match.isScrap; match.origin = item.origin || match.origin; addMovement('addition', 'inventory', match.id, item.quantity, match.unit, null, 'Import inventaire fusionné'); }
    else { item.id = uid('stock'); state.inventory.push(item); addMovement('addition', 'inventory', item.id, item.quantity, item.unit, null, 'Import inventaire'); }
  });
  imported.filaments.forEach(item => {
    const importedCode = normalizeFilamentCode(item.code);
    const match = merge && importedCode ? state.filaments.find(current => normalizeFilamentCode(current.code) === importedCode) : null;
    if (match) { const previous = match.remainingWeight; Object.assign(match, { ...item, id: match.id, code: match.code, reservedWeight: Math.min(match.reservedWeight, item.remainingWeight) }); addMovement('adjustment', 'filament', match.id, Math.abs(item.remainingWeight - previous), 'g', null, `Import de mise à jour ${match.code}`); }
    else { item.id = uid('filament'); item.code = importedCode || nextFilamentCode(); state.filaments.push(item); ensureFilamentCodes(); addMovement('addition', 'filament', item.id, item.remainingWeight, 'g', null, `Import bobine ${item.code}`); }
  });
  (imported.tools || []).forEach(item => { const match = merge ? state.tools.find(current => toolSignature(current) === toolSignature(item)) : null; if (!match) { item.id = uid('tool'); state.tools.push(item); } });
  (imported.machines || []).forEach(item => { const signature = normalizeText(`${item.name} ${item.brand} ${item.model}`); const match = merge ? state.machines.find(current => normalizeText(`${current.name} ${current.brand} ${current.model}`) === signature) : null; if (match) Object.assign(match,{...item,id:match.id,code:match.code||item.code}); else { item.id=uid('machine'); item.code=normalizeMachineCode(item.code)||nextMachineCode(); state.machines.push(item); } }); ensureMachineCodes();
  if (importMap && imported.workshopMap) state.workshopMap = normalizeWorkshopMap(imported.workshopMap);
}

function projectToExport(project) {
  return {
    format: 'atelier-2.0', version: '1.3', type: 'project',
    project: {
      name: project.name, category: project.category, description: project.description, icon: project.icon, status: project.status,
      dimensions_mm: { width_mm: project.width, depth_mm: project.depth, height_mm: project.height },
      requirements: (project.requirements || []).map(req => ({ name: req.name, category: req.category, material: req.material, stock_type: req.stockType, unit: req.unit, required_quantity: req.plannedQty, required_length_mm: req.requiredLengthMm, width_mm: req.widthMm, thickness_mm: req.thicknessMm, color: req.color, notes: req.notes })),
      pieces: (project.pieces || []).map(item => ({ ref: item.ref, name: item.name, type: item.type, material: item.material, quantity: item.qty, dimensions: { length_mm: item.length, width_mm: item.width, thickness_mm: item.thickness }, status: item.status, unit_cost: item.unitCost })),
      prints: (project.prints || []).map(item => ({ name: item.name, quantity: item.qty, material: item.material, color: item.color, weight_g: item.weight, duration_hours: item.duration, status: item.status })),
      assembly_steps: (project.steps || []).map((item,index) => ({ order: index + 1, title: item.title, description: item.description, done: item.done })),
      expenses: (project.expenses || []).map(item => ({ label: item.label, category: item.category, amount: item.amount })),
      actual_consumption: project.actualConsumption || [], completion_note: project.completionNote || ''
    }
  };
}

function inventoryToExport() {
  return {
    format: 'atelier-2.0', version: '1.7', type: 'inventory',
    inventory: {
      items: state.inventory.map(item => ({ name: item.name, category: item.category, material: item.material, stock_type: item.stockType, unit: item.unit, quantity: item.quantity, reserved_quantity: item.reserved, length_mm: item.lengthMm, width_mm: item.widthMm, thickness_mm: item.thicknessMm, location: item.location, unit_cost: item.unitCost, low_threshold: item.lowThreshold, is_scrap: item.isScrap, origin: item.origin, notes: item.notes })),
      filaments: state.filaments.map(item => ({ code: item.code, brand: item.brand, range: item.range, material: item.material, color_name: item.colorName, color_hex: item.colorHex, initial_weight_g: item.initialWeight, remaining_weight_g: item.remainingWeight, reserved_weight_g: item.reservedWeight, spool_weight_g: item.spoolWeight, price: item.price, location: item.location, opened_at: item.openedAt, nozzle_temperature: item.nozzle, bed_temperature: item.bed, notes: item.notes })),
      tools: state.tools.map(item => ({ name: item.name, category: item.category, location: item.location, notes: item.notes })),
      machines: state.machines.map(item => ({ code: item.code, name: item.name, category: item.category, brand: item.brand, model: item.model, serial_number: item.serialNumber, location: item.location, status: item.status, purchase_date: item.purchaseDate, purchase_price: item.purchasePrice, warranty_until: item.warrantyUntil, power_w: item.powerW, kerf_mm: item.kerfMm, capacity_mm: item.capacityMm, last_maintenance: item.lastMaintenance, next_maintenance: item.nextMaintenance, maintenance_interval_days: item.maintenanceIntervalDays, manual_url: item.manualUrl, accessories: item.accessories, consumable_stock_ids: item.consumableStockIds, maintenance_history: item.maintenanceHistory, notes: item.notes })),
      workshop_map: state.workshopMap
    }
  };
}

function projectExample() {
  return {
    format: 'atelier-2.0', version: '1.3', type: 'project',
    project: {
      name: 'Étagère murale avec supports 3D', category: 'Projet mixte', description: 'Étagère en tasseaux et tablettes, supports imprimés en PETG.', icon: '🪵',
      dimensions_mm: { width_mm: 1200, depth_mm: 250, height_mm: 700 },
      requirements: [
        { name: 'Tasseau sapin 35 × 60 mm', category: 'Bois', material: 'Sapin', stock_type: 'linear', unit: 'mm', required_length_mm: 5200, width_mm: 60, thickness_mm: 35 },
        { name: 'Vis 5 × 80 mm', category: 'Quincaillerie', stock_type: 'count', unit: 'pièce', required_quantity: 24 },
        { name: 'PETG noir', category: 'Filament', material: 'PETG', color: 'Noir', stock_type: 'weight', unit: 'g', required_quantity: 160 }
      ],
      pieces: [
        { ref: 'A', name: 'Montant', type: 'Découpe bois', material: 'Tasseau 35 × 60 mm', quantity: 2, dimensions: { length_mm: 700, width_mm: 60, thickness_mm: 35 } },
        { ref: 'B', name: 'Traverse', type: 'Découpe bois', material: 'Tasseau 35 × 60 mm', quantity: 4, dimensions: { length_mm: 1200, width_mm: 60, thickness_mm: 35 } }
      ],
      prints: [{ name: 'Support de tablette', quantity: 6, material: 'PETG', color: 'Noir', weight_g: 160, duration_hours: 8 }],
      assembly_steps: [{ order: 1, title: 'Découper les éléments', description: 'Découper et repérer les tasseaux.' }, { order: 2, title: 'Assembler la structure', description: 'Contrôler l’équerrage.' }, { order: 3, title: 'Poser les supports imprimés', description: 'Fixer les supports puis les tablettes.' }],
      expenses: [{ label: 'Tablettes', category: 'Bois', amount: 35 }]
    }
  };
}

function inventoryExample() {
  return {
    format: 'atelier-2.0', version: '1.7', type: 'inventory',
    inventory: {
      items: [
        { name: 'Tasseau sapin 35 × 60 mm', category: 'Bois', material: 'Sapin', stock_type: 'linear', unit: 'barre', quantity: 6, length_mm: 3000, width_mm: 60, thickness_mm: 35, location: 'Zone bois • Râtelier', unit_cost: 5.9, low_threshold: 2 },
        { name: 'Chute tasseau sapin 35 × 60 mm', category: 'Bois', material: 'Sapin', stock_type: 'linear', unit: 'barre', quantity: 1, length_mm: 780, width_mm: 60, thickness_mm: 35, location: 'Zone bois • Bac à chutes', is_scrap: true, origin: 'Ancienne découpe' },
        { name: 'Vis extérieure 5 × 80 mm', category: 'Quincaillerie', material: 'Acier zingué', stock_type: 'count', unit: 'pièce', quantity: 120, length_mm: 80, width_mm: 5, location: 'Meuble quincaillerie • Bac B3', low_threshold: 20 }
      ],
      filaments: [{ code: 'FIL-0001', brand: 'Bambu Lab', range: 'Basic', material: 'PETG', color_name: 'Noir', color_hex: '#191919', initial_weight_g: 1000, remaining_weight_g: 612, spool_weight_g: 250, price: 19.99, location: 'Zone impression 3D • Étagère 2' }],
      tools: [{ name: 'Visseuse', category: 'Électroportatif', location: 'Servante • Tiroir 1' }],
      machines: [{ code: 'MAC-0001', name: 'Scie à onglet', category: 'Découpe', brand: 'Metabo', location: 'Établi principal', status: 'Disponible', power_w: 1800, kerf_mm: 3, capacity_mm: 305, maintenance_interval_days: 90, next_maintenance: '2026-09-15', accessories: ['Lame bois 60 dents'] }, { code: 'MAC-0002', name: 'Bambu Lab A1', category: 'Impression 3D', brand: 'Bambu Lab', model: 'A1', location: 'Zone impression 3D', status: 'Disponible', power_w: 350, capacity_mm: 256, maintenance_interval_days: 30, manual_url: 'https://wiki.bambulab.com/en/a1', accessories: ['Buse 0,4 mm', 'Plateau PEI'], notes: 'Profil PETG validé' }]
    }
  };
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportProject(project) { downloadJson(projectToExport(project), `atelier-projet-${normalizeText(project.name).replace(/\s+/g,'-') || 'projet'}.json`); toast('Projet exporté.'); }
function exportSelectedProject() { const project = selectedProject(); if (project) exportProject(project); }
function exportInventory() { downloadJson(inventoryToExport(), `atelier-inventaire-${new Date().toISOString().slice(0,10)}.json`); toast('Inventaire exporté.'); }
function exportData() { downloadJson(state, `atelier-2-0-sauvegarde-${new Date().toISOString().slice(0,10)}.json`); toast('Sauvegarde complète exportée.'); }

async function handleBackupFile(file) {
  try { const parsed = JSON.parse(await file.text()); if (!parsed.projects && !parsed.inventory && !parsed.stock) throw new Error('Ce fichier ne ressemble pas à une sauvegarde complète.'); if (state.projects.length && !confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) return; state = migrateState(parsed); state.projects.forEach(project => rematchProjectRequirements(project, true)); await saveState(); render(); toast('Sauvegarde restaurée.'); }
  catch (error) { toast(error.message || 'Sauvegarde invalide.'); }
  $('#backupImportInput').value = '';
}

function copyChatGptPrompt() {
  const text = $('#chatgptPromptText')?.textContent || 'Transforme ma description en fichier JSON compatible avec Atelier 2.0 V1.7.';
  navigator.clipboard?.writeText(text).then(() => toast('Message copié.')).catch(() => { const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); toast('Message copié.'); });
}

function saveSettings() {
  state.settings.owner = $('#settingOwner').value.trim();
  state.settings.units = $('#settingUnits').value;
  state.settings.electricityPrice = num($('#settingElectricity').value);
  state.settings.printerPowerKw = num($('#settingPower').value);
  state.settings.defaultKerfMm = Math.max(0,num($('#settingKerf').value));
  state.settings.defaultMinScrapMm = Math.max(0,num($('#settingMinScrap').value));
  saveState(); toast('Paramètres enregistrés.');
}
async function loadDemo() { if ((state.inventory.length || state.filaments.length || state.machines.length) && !confirm('Remplacer les données actuelles par les données d’exemple ?')) return; state = demoState(); await saveState(); closeModal(); navigate('home'); toast('Données d’exemple chargées.'); }
async function resetApp() { if (!confirm('Effacer tous les stocks, bobines, machines, découpes et dossiers sur cet appareil ?')) return; state = emptyState(); state.settings.onboardingDone = true; await saveState(); navigate('home'); toast('Application réinitialisée.'); }

function openSearch() {
  if (searchOverlay) return;
  searchOverlay = document.createElement('section'); searchOverlay.className = 'search-overlay'; searchOverlay.innerHTML = `<div class="search-head"><input id="globalSearch" class="input" placeholder="Rechercher un stock, une bobine, une machine…" autofocus><button class="btn btn-ghost" id="closeSearch">Fermer</button></div><div id="globalSearchResults" class="search-results"><div class="empty-state"><strong>Recherche globale</strong>Saisissez au moins deux caractères.</div></div>`; document.body.append(searchOverlay); $('#closeSearch', searchOverlay).addEventListener('click', closeSearch); $('#globalSearch', searchOverlay).addEventListener('input', event => runGlobalSearch(event.target.value));
}
function closeSearch() { searchOverlay?.remove(); searchOverlay = null; }
function runGlobalSearch(query) {
  const q = normalizeText(query); const out = $('#globalSearchResults', searchOverlay); if (q.length < 2) { out.innerHTML = '<div class="empty-state"><strong>Recherche globale</strong>Saisissez au moins deux caractères.</div>'; return; }
  const results = [];
  state.inventory.forEach(item => { if (normalizeText(`${item.name} ${item.material} ${item.location} ${item.origin}`).includes(q)) results.push({ title: item.name, sub: `Stock • ${item.location || item.category}`, route: 'inventory' }); });
  state.filaments.forEach(item => { if (normalizeText(`${item.code} ${item.material} ${item.colorName} ${item.brand} ${item.location}`).includes(q)) results.push({ title: `${item.code} — ${item.material} ${item.colorName}`, sub: `Bobine • ${item.location || item.brand}`, route: 'filaments', filamentId: item.id }); });
  state.machines.forEach(item => { if (normalizeText(`${item.code} ${item.name} ${item.brand} ${item.model} ${item.serialNumber} ${item.location}`).includes(q)) results.push({ title: item.name, sub: `Machine • ${item.location || item.category}`, route: 'equipment', equipmentTab: 'machines' }); });
  state.tools.forEach(item => { if (normalizeText(`${item.name} ${item.category} ${item.location}`).includes(q)) results.push({ title: item.name, sub: `Outil • ${item.location || item.category}`, route: 'atelier', atelierTab: 'plan', mapLocation: item.location }); });
  state.cutJobs.forEach(item => { if (normalizeText(item.name).includes(q)) results.push({ title: item.name, sub: `Découpe • ${item.status}`, route: 'cuts', cutId: item.id }); });
  state.projects.forEach(project => { if (normalizeText(`${project.name} ${project.description} ${project.category}`).includes(q)) results.push({ title: project.name, sub: `Dossier • ${project.status}`, projectId: project.id, tab: 'summary' }); });
  out.innerHTML = results.length ? results.slice(0,25).map((result,index) => `<button class="list-row" type="button" data-search-result="${index}"><span><strong>${escapeHtml(result.title)}</strong><span class="list-row-sub" style="display:block">${escapeHtml(result.sub)}</span></span><strong>→</strong></button>`).join('') : '<div class="empty-state"><strong>Aucun résultat</strong>Essayez un autre terme.</div>';
  $$('[data-search-result]', out).forEach(button => button.addEventListener('click', () => { const result = results[num(button.dataset.searchResult)]; closeSearch(); if (result.projectId) navigate('project', { projectId: result.projectId, projectTab: result.tab }); else { navigate(result.route, { equipmentTab: result.equipmentTab, atelierTab: result.atelierTab }); if (result.filamentId) setTimeout(()=>openFilamentQuickView(result.filamentId),0); if (result.cutId) setTimeout(()=>openCutPlan(result.cutId),0); if(result.mapLocation)setTimeout(()=>{const marker=state.workshopMap.markers.find(value=>locationMatches(value.location,result.mapLocation));if(marker)openMapMarkerDetails(marker.id);},0); } }));
}

async function firstRun() {
  if (state.settings.onboardingDone) return;
  openModal('Bienvenue dans Atelier 2.0', `<div style="text-align:center"><img src="logo.svg" alt="Atelier 2.0" style="max-width:420px"><p>Cette version est centrée sur le stock, les bobines, les équipements, le plan de l’atelier et l’optimisation des découpes.</p><div class="info-banner"><strong>Parcours conseillé</strong><div class="small">1. Importer l’inventaire • 2. Recenser les équipements • 3. Positionner les emplacements sur le plan • 4. Préparer les découpes.</div></div></div>`, `<button class="btn btn-ghost" data-empty>Commencer vide</button><button class="btn btn-primary" data-demo>Voir l’exemple</button>`, modal => {
    $('[data-empty]', modal).addEventListener('click', async () => { state.settings.onboardingDone = true; await saveState(); closeModal(); render(); });
    $('[data-demo]', modal).addEventListener('click', async () => { state = demoState(); await saveState(); closeModal(); render(); });
  });
}

async function init() {
  await loadState();
  render();
  $('#searchButton').addEventListener('click', openSearch);
  $('#projectImportInput').addEventListener('change', event => { const file = event.target.files[0]; if (file) handleProjectFile(file); });
  $('#inventoryImportInput').addEventListener('change', event => { const file = event.target.files[0]; if (file) handleInventoryFile(file); });
  $('#backupImportInput').addEventListener('change', event => { const file = event.target.files[0]; if (file) handleBackupFile(file); });
  if ('serviceWorker' in navigator && window.location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(error => console.warn(error));
  await firstRun();
  ensureFilamentCodes();
  ensureMachineCodes();
  await saveState();
  openDeepLinkedFilament();
}

document.addEventListener('DOMContentLoaded', init);
