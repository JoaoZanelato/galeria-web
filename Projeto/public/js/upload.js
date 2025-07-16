// Aguarda o carregamento completo do DOM antes de executar o script
document.addEventListener("DOMContentLoaded", () => {
  // Seleciona os elementos principais da área de upload
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const dropZoneText = document.querySelector(".drop-zone__text");
  const previewContainer = document.getElementById("imagePreviewContainer");

  // Retorna se os elementos essenciais não forem encontrados para evitar erros.
  if (!dropZone || !fileInput) {
    console.error(
      "A área de upload ou o input de arquivo não foram encontrados no HTML."
    );
    return;
  }

  // *** LÓGICA DO CLIQUE NA ÁREA DE UPLOAD ***
  // Aciona o clique no input de arquivo escondido quando a área de upload é clicada.
  dropZone.addEventListener("click", () => {
    fileInput.click();
  });

  // Lógica para o efeito visual de arrastar e soltar
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault(); // Previne o comportamento padrão do navegador
    dropZone.classList.add("drag-over");
  });

  // Remove o efeito visual quando o usuário para de arrastar
  ["dragleave", "dragend"].forEach((type) => {
    dropZone.addEventListener(type, () => {
      dropZone.classList.remove("drag-over");
    });
  });

  // Lógica para quando um arquivo é "solto" na área
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files; // Coloca os arquivos soltos no input
      updateThumbnail(); // Mostra a pré-visualização da imagem
    }
  });

  // Atualiza a pré-visualização quando um arquivo é selecionado (tanto por clique quanto por arrastar)
  fileInput.addEventListener("change", () => {
    updateThumbnail();
  });

  /**
   * Função que lê o arquivo selecionado e exibe uma miniatura (thumbnail).
   */
  function updateThumbnail() {
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const reader = new FileReader();

      reader.onload = () => {
        // Limpa o container e esconde o texto de instrução
        if (previewContainer) previewContainer.innerHTML = "";
        if (dropZoneText) dropZoneText.style.display = "none";

        // Cria o elemento da imagem de pré-visualização
        const img = document.createElement("img");
        img.src = reader.result;
        img.classList.add("image-preview");
        if (previewContainer) previewContainer.appendChild(img);
      };

      reader.readAsDataURL(file);
    }
  }

  // Lógica para alternar entre criar um novo álbum ou usar um existente
  const radios = document.querySelectorAll('input[name="tipoAlbum"]');
  const albumExistenteGroup = document.getElementById("albumExistenteGroup");
  const albumNovoGroup = document.getElementById("albumNovoGroup");

  // Só executa se os elementos de grupo de álbum existirem
  if (radios.length > 0 && albumExistenteGroup && albumNovoGroup) {
    radios.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        // Mostra ou esconde os campos conforme a opção selecionada
        if (e.target.value === "novo") {
          albumExistenteGroup.style.display = "none";
          albumNovoGroup.style.display = "block";
        } else {
          albumExistenteGroup.style.display = "block";
          albumNovoGroup.style.display = "none";
        }
      });
    });
  }
});