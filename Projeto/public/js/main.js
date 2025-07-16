// Aguarda o carregamento completo do DOM antes de executar o script
document.addEventListener("DOMContentLoaded", function () {
  // Pega o elemento do modal de imagem
  var modal = document.getElementById("imageModal");

  // Só executa o código se o modal existir na página atual
  if (modal) {
    // Pega os elementos internos do modal: imagem e legenda
    var modalImg = document.getElementById("modalImage");
    var captionText = document.getElementById("modalCaption");

    // Verifica se os elementos internos do modal existem
    if (!modalImg || !captionText) {
      console.error("Partes internas do modal não foram encontradas!");
      return;
    }

    // Adiciona um evento de clique a cada cartão de imagem
    document.querySelectorAll(".image-card").forEach((card) => {
      card.onclick = function () {
        // Quando o cartão é clicado, exibe o modal com a imagem e legenda correspondente
        const img = this.querySelector("img");
        modal.classList.add("visible");
        modalImg.src = img.src;
        captionText.innerHTML = img.alt;
      };
    });

    // Pega o botão de fechar do modal
    var span = document.getElementsByClassName("modal-close")[0];

    // Função para fechar o modal
    function closeModal() {
      modal.classList.remove("visible");
    }

    // Adiciona evento de clique ao botão de fechar
    if (span) {
      span.onclick = closeModal;
    }

    // Fecha o modal ao clicar fora da área da imagem/modal
    window.onclick = function (event) {
      if (event.target == modal) {
        closeModal();
      }
    };
  }
});
