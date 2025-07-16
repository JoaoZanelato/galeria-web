// Importa o módulo Cloudinary v2 para manipulação de imagens na nuvem
const cloudinary = require('cloudinary').v2;
// Importa o storage do multer para integração com Cloudinary
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configura as credenciais do Cloudinary usando variáveis de ambiente
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, // Nome da conta Cloudinary
  api_key: process.env.CLOUDINARY_KEY,           // Chave de API
  api_secret: process.env.CLOUDINARY_SECRET      // Segredo da API
});

// Configure o armazenamento do Multer para o Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary, // Instância do Cloudinary
  params: {
    folder: 'galeria-web', // Pasta no Cloudinary onde as imagens serão salvas
    allowedFormats: ['jpeg', 'jpg', 'png'], // Formatos permitidos
    transformation: [{ width: 500, height: 500, crop: 'limit' }] // Redimensiona as imagens
  }
});

// Exporta o objeto cloudinary e o storage para uso em outros arquivos do projeto
module.exports = {
  cloudinary,
  storage
};