document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const dropZoneText = document.querySelector('.drop-zone__text');
    const previewContainer = document.getElementById('imagePreviewContainer');

    if (!dropZone || !fileInput) return;

    // Abrir seletor de arquivo ao clicar
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    // Lógica para arrastar e soltar
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    ['dragleave', 'dragend'].forEach(type => {
        dropZone.addEventListener(type, () => {
            dropZone.classList.remove('drag-over');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            updateThumbnail();
        }
    });

    // Atualiza a imagem quando um arquivo é selecionado
    fileInput.addEventListener('change', () => {
        updateThumbnail();
    });

    function updateThumbnail() {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const reader = new FileReader();

            reader.onload = () => {
                // Limpa o container e o texto
                previewContainer.innerHTML = '';
                if(dropZoneText) dropZoneText.style.display = 'none';

                // Cria o elemento da imagem de preview
                const img = document.createElement('img');
                img.src = reader.result;
                img.classList.add('image-preview');
                previewContainer.appendChild(img);
            };
            
            reader.readAsDataURL(file);
        }
    }
    
    // Lógica para alternar entre álbum novo e existente
    const radios = document.querySelectorAll('input[name="tipoAlbum"]');
    const albumExistenteGroup = document.getElementById('albumExistenteGroup');
    const albumNovoGroup = document.getElementById('albumNovoGroup');

    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'novo') {
                albumExistenteGroup.style.display = 'none';
                albumNovoGroup.style.display = 'block';
            } else {
                albumExistenteGroup.style.display = 'block';
                albumNovoGroup.style.display = 'none';
            }
        });
    });
});