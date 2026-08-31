import qrcode

url = "https://gregnatiello.github.io/1_ano_Olivia/"

img = qrcode.make(url)
img.save("qrcode_site.png")