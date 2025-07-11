document.addEventListener("DOMContentLoaded", function () {
  //Pega os elementos do modal
  var modal = document.getElementById("imageModal");

  // SÓ EXECUTA O CÓDIGO SE O MODAL EXISTIR NA PÁGINA ATUAL
  if (modal) {
    var modalImg = document.getElementById("modalImage");
    var captionText = document.getElementById("modalCaption");

    if (!modalImg || !captionText) {
      console.error("Partes internas do modal não foram encontradas!");
      return;
    }

    //adiciona um evento de clique a cada cartão de imagem
    document.querySelectorAll(".image-card").forEach((card) => {
      card.onclick = function () {
        const img = this.querySelector("img");
        modal.classList.add("visible");
        modalImg.src = img.src;
        captionText.innerHTML = img.alt;
      };
    });

    var span = document.getElementsByClassName("modal-close")[0];

    function closeModal() {
      modal.classList.remove("visible");
    }

    if (span) {
      span.onclick = closeModal;
    }

    window.onclick = function (event) {
      if (event.target == modal) {
        closeModal();
      }
    };
  }
});
