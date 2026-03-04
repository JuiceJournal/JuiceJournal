/**
 * Auth Routes
 * Kullanici kayit, giris ve profil islemleri
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { User } = require('../models');
const { authenticate, generateToken } = require('../middleware/auth');

/**
 * Validation middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      data: null,
      error: errors.array()[0].msg
    });
  }
  next();
};

/**
 * POST /api/auth/register
 * Yeni kullanici kaydi
 */
router.post('/register',
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Kullanici adi 3-50 karakter arasinda olmalidir')
      .isAlphanumeric()
      .withMessage('Kullanici adi sadece harf ve rakam icerebilir'),
    body('email')
      .trim()
      .isEmail()
      .withMessage('Gecerli bir e-posta adresi giriniz')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Sifre en az 6 karakter olmalidir'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { username, email, password } = req.body;

      // Kullanici adi veya email kontrolu
      const existingUser = await User.findOne({
        where: {
          [require('sequelize').Op.or]: [
            { username },
            { email }
          ]
        }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          data: null,
          error: existingUser.username === username 
            ? 'Bu kullanici adi zaten kullaniliyor'
            : 'Bu e-posta adresi zaten kullaniliyor'
        });
      }

      // Sifreyi hashle
      const passwordHash = await User.hashPassword(password);

      // Kullanici olustur
      const user = await User.create({
        username,
        email,
        passwordHash
      });

      // Token olustur
      const token = generateToken(user.id);

      res.status(201).json({
        success: true,
        data: {
          user,
          token
        },
        error: null
      });
    } catch (error) {
      console.error('Kayit hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Kayit sirasinda bir hata olustu'
      });
    }
  }
);

/**
 * POST /api/auth/login
 * Kullanici girisi
 */
router.post('/login',
  [
    body('username')
      .trim()
      .notEmpty()
      .withMessage('Kullanici adi veya e-posta gereklidir'),
    body('password')
      .notEmpty()
      .withMessage('Sifre gereklidir'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { username, password } = req.body;

      // Kullaniciyi bul (username veya email ile)
      const user = await User.findOne({
        where: {
          [require('sequelize').Op.or]: [
            { username },
            { email: username }
          ]
        }
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          data: null,
          error: 'Kullanici adi veya sifre hatali'
        });
      }

      // Sifreyi dogrula
      const isValidPassword = await user.comparePassword(password);

      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          data: null,
          error: 'Kullanici adi veya sifre hatali'
        });
      }

      // Token olustur
      const token = generateToken(user.id);

      res.json({
        success: true,
        data: {
          user,
          token
        },
        error: null
      });
    } catch (error) {
      console.error('Giris hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Giris sirasinda bir hata olustu'
      });
    }
  }
);

/**
 * GET /api/auth/me
 * Mevcut kullanici bilgilerini getir
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: req.user
      },
      error: null
    });
  } catch (error) {
    console.error('Profil getirme hatasi:', error);
    res.status(500).json({
      success: false,
      data: null,
      error: 'Profil bilgileri alinirken hata olustu'
    });
  }
});

/**
 * PUT /api/auth/me
 * Kullanici profilini guncelle
 */
router.put('/me',
  authenticate,
  [
    body('email')
      .optional()
      .isEmail()
      .withMessage('Gecerli bir e-posta adresi giriniz')
      .normalizeEmail(),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { email } = req.body;

      // Email degisikligi varsa kontrol et
      if (email && email !== req.user.email) {
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
          return res.status(400).json({
            success: false,
            data: null,
            error: 'Bu e-posta adresi zaten kullaniliyor'
          });
        }
      }

      await req.user.update({ email });

      res.json({
        success: true,
        data: {
          user: req.user
        },
        error: null
      });
    } catch (error) {
      console.error('Profil guncelleme hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Profil guncellenirken hata olustu'
      });
    }
  }
);

module.exports = router;
