document.addEventListener('DOMContentLoaded', function(){
    //Pega os elementos do modal
    var modal = document.getElementById('imageModal');
    var modalImg = document.getElementById('modalImage');
    var captionText = document.getElementById('modalCaption');

    if(!modal || !modalImg || !captionText) {
        console.error("Elementos do modal não encontrados!")
        return
    }

    //adiciona um evento de clique a cada cartão de imagem
    document.querySelectorAll('.image-card').forEach(card => {
        card.onclick = function() {
            const img = this.querySelector('img'); // Pega a imagem dentro do cartão clicado
            modal.classList.add('visible');
            modalImg.src = img.src; // Usa o URL da imagem clicada
            captionText.innerHTML = img.alt; // Usa o texto alternativo como legenda
        }
    })
    // Pega o elemento <span> que fecha o modal
    var span = document.getElementsByClassName('modal-close')[0];

    // Função para fechar o modal
    function closeModal(){
        modal.classList.remove('visible');
    }

    // Quando o usuário clica no <span> (x), fecha o modal
    if(span) {
        span.onclick = closeModal;
    }

    // Fecha o modal se o usuário clicar fora da imagem
    window.onclick = function(event) {
        if(event.target == modal) {
            closeModal();
        }
    }
})