# Descarga las dos primeras imágenes de Google para un query y las guarda en el directorio actual.
# Requisitos: pip install icrawler

from icrawler.builtin import GoogleImageCrawler

def download_two_images(query: str):
    # Guardar directamente en el directorio actual
    crawler = GoogleImageCrawler(storage={'root_dir': '.'})
    crawler.crawl(keyword=query, max_num=2)

if __name__ == "__main__":
    # Cambia aquí tu búsqueda
    query = "perlita"
    download_two_images(query)
    print(f"Descargadas 2 imágenes para '{query}' en el directorio actual.")
