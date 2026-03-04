/**
 * OCR Scanner Module
 * Tesseract.js kullanarak ekran goruntulerinden metin okur
 * ve PoE itemlerini tespit eder
 */

const Tesseract = require('tesseract.js');

class OCRScanner {
  constructor() {
    this.worker = null;
    this.isInitialized = false;
    this.itemKeywords = {
      // Currency
      'chaos orb': { type: 'currency', keywords: ['chaos orb', 'chaos'] },
      'divine orb': { type: 'currency', keywords: ['divine orb', 'divine'] },
      'exalted orb': { type: 'currency', keywords: ['exalted orb', 'exalted'] },
      'orb of alteration': { type: 'currency', keywords: ['orb of alteration'] },
      'orb of fusing': { type: 'currency', keywords: ['orb of fusing', 'fusing'] },
      'orb of alchemy': { type: 'currency', keywords: ['orb of alchemy'] },
      'orb of scouring': { type: 'currency', keywords: ['orb of scouring'] },
      'regal orb': { type: 'currency', keywords: ['regal orb'] },
      'vaal orb': { type: 'currency', keywords: ['vaal orb'] },
      'chromatic orb': { type: 'currency', keywords: ['chromatic orb'] },
      'jeweller orb': { type: 'currency', keywords: ['jeweller'] },
      'cartographer chisel': { type: 'currency', keywords: ['cartographer chisel', 'chisel'] },
      'orb of regret': { type: 'currency', keywords: ['orb of regret'] },
      'blessed orb': { type: 'currency', keywords: ['blessed orb'] },
      'orb of chance': { type: 'currency', keywords: ['orb of chance'] },
      
      // Fragments
      'sacrifice at dusk': { type: 'fragment', keywords: ['sacrifice at dusk'] },
      'sacrifice at midnight': { type: 'fragment', keywords: ['sacrifice at midnight'] },
      'sacrifice at dawn': { type: 'fragment', keywords: ['sacrifice at dawn'] },
      'sacrifice at noon': { type: 'fragment', keywords: ['sacrifice at noon'] },
      'mortal grief': { type: 'fragment', keywords: ['mortal grief'] },
      'mortal rage': { type: 'fragment', keywords: ['mortal rage'] },
      'mortal hope': { type: 'fragment', keywords: ['mortal hope'] },
      'mortal ignorance': { type: 'fragment', keywords: ['mortal ignorance'] },
      
      // Scarabs (genel tanimlamalar)
      'scarab': { type: 'scarab', keywords: ['scarab'] },
      
      // Maps
      'map': { type: 'map', keywords: ['map'] },
      
      // Divination Cards
      'card': { type: 'divination_card', keywords: ['divination card'] }
    };
  }

  /**
   * Tesseract worker'i baslat
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      this.worker = await Tesseract.createWorker('eng');
      this.isInitialized = true;
      console.log('Tesseract worker baslatildi');
    } catch (error) {
      console.error('Tesseract baslatma hatasi:', error);
      throw error;
    }
  }

  /**
   * Tesseract worker'i kapat
   */
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
      console.log('Tesseract worker kapatildi');
    }
  }

  /**
   * Goruntuyu tara ve itemleri tespit et
   * @param {Buffer} imageBuffer - PNG/JPG buffer
   * @returns {Array} - Tespit edilen itemler
   */
  async scanImage(imageBuffer) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      console.log('OCR taramasi basliyor...');
      
      // Tesseract ile metni oku
      const { data: { text } } = await this.worker.recognize(imageBuffer);
      
      console.log('OCR metin:', text.substring(0, 500) + '...');

      // Metinden itemleri parse et
      const items = this.parseItemsFromText(text);
      
      console.log(`${items.length} item tespit edildi`);
      
      return items;
    } catch (error) {
      console.error('OCR tarama hatasi:', error);
      return [];
    }
  }

  /**
   * Metinden PoE itemlerini parse et
   */
  parseItemsFromText(text) {
    const items = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Sayi + Item adi pattern'i ara
      // Ornek: "x45 Chaos Orb" veya "45x Chaos Orb" veya "Chaos Orb x45"
      
      const patterns = [
        // x45 Chaos Orb veya 45x Chaos Orb
        /^(?:x?(\d+)x?)\s*(.+?)$/i,
        // Chaos Orb x45 veya Chaos Orb (45)
        /^(.+?)\s*(?:x?(\d+)x?|\((\d+)\))$/i
      ];

      let quantity = 1;
      let itemName = line;

      // Stack sayisi var mi kontrol et
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const num1 = parseInt(match[1]);
          const num2 = parseInt(match[2]);
          const num3 = parseInt(match[3]);
          
          if (num1 && num1 > 1 && num1 < 10000) {
            quantity = num1;
            itemName = match[2].trim();
            break;
          } else if (num2 && num2 > 1 && num2 < 10000) {
            quantity = num2;
            itemName = match[1].trim();
            break;
          } else if (num3 && num3 > 1 && num3 < 10000) {
            quantity = num3;
            itemName = match[1].trim();
            break;
          }
        }
      }

      // Item tipini tespit et
      const itemType = this.detectItemType(itemName);
      
      // Gecerli bir item mi kontrol et
      if (itemType && this.isValidItem(itemName)) {
        items.push({
          itemName: this.cleanItemName(itemName),
          itemType,
          quantity,
          source: 'ocr'
        });
      }
    }

    // Ayni itemleri birlestir
    return this.mergeDuplicateItems(items);
  }

  /**
   * Item tipini tespit et
   */
  detectItemType(itemName) {
    const lowerName = itemName.toLowerCase();

    for (const [standardName, data] of Object.entries(this.itemKeywords)) {
      for (const keyword of data.keywords) {
        if (lowerName.includes(keyword.toLowerCase())) {
          return data.type;
        }
      }
    }

    // Default olarak currency varsay
    if (this.looksLikeCurrency(lowerName)) {
      return 'currency';
    }

    return 'other';
  }

  /**
   * Metin currency gibi mi gorunuyor?
   */
  looksLikeCurrency(text) {
    const currencyPatterns = [
      /orb/i,
      /shard/i,
      /fragment/i,
      /sacrifice/i,
      /mortal/i,
      /splinter/i,
      /breachstone/i
    ];

    return currencyPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Gecerli item mi kontrol et
   */
  isValidItem(itemName) {
    // En az 3 karakter olmali
    if (itemName.length < 3) return false;

    // Sadece rakam olmamali
    if (/^\d+$/.test(itemName)) return false;

    // Yaygin yanlis tespitleri filtrele
    const invalidPatterns = [
      /^stash$/i,
      /^inventory$/i,
      /^character$/i,
      /^level$/i,
      /^life$/i,
      /^mana$/i,
      /^exit$/i,
      /^menu$/i,
      /^options$/i
    ];

    return !invalidPatterns.some(pattern => pattern.test(itemName));
  }

  /**
   * Item adini temizle
   */
  cleanItemName(name) {
    return name
      .replace(/[^\w\s-']/gi, '') // Ozel karakterleri temizle
      .replace(/\s+/g, ' ') // Coklu bosluklari tek bosluga cevir
      .trim();
  }

  /**
   * Ayni itemleri birlestir
   */
  mergeDuplicateItems(items) {
    const merged = {};

    for (const item of items) {
      const key = `${item.itemName.toLowerCase()}_${item.itemType}`;
      
      if (merged[key]) {
        merged[key].quantity += item.quantity;
      } else {
        merged[key] = { ...item };
      }
    }

    return Object.values(merged);
  }

  /**
   * Belirli bir bolgeyi tara (koordinat bazli)
   * Not: Electron'un desktopCapturer'i zaten belirli bir bolgeyi yakalayabilir
   */
  async scanRegion(imageBuffer, region) {
    // Gelecekte implementasyon icin yer tutucu
    // Su an tam ekran taraniyor, gerekirse crop islemi eklenebilir
    return this.scanImage(imageBuffer);
  }
}

module.exports = OCRScanner;
