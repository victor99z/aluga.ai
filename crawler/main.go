package main

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/gocolly/colly/v2"
	"github.com/victor99z/aluga.ai/config"
	"github.com/victor99z/aluga.ai/model"
)

func main() {

	//repository.CreateTable()

	c := colly.NewCollector()

	linksFromPage := make(map[string]bool)

	imoveis := []model.Imovel{}

	// Find and visit all links
	// div.imovel-data > header > div > strong
	c.OnHTML("article.imovel div.imovel-data", func(e *colly.HTMLElement) {

		r, _ := regexp.Compile("/alugar/apartamento")

		if r.MatchString(e.Attr("href")) {
			linksFromPage[e.Attr("href")] = true
		}

		newImovel := model.Imovel{}

		newImovel.Url = e.Attr("a[href]")
		newImovel.Website = "imoveis-sc"
		tmp := strings.Split(e.ChildText("div.imovel-data > header > div > strong"), ", ")
		newImovel.Cidade = tmp[0]
		newImovel.Bairro = tmp[1]

		parseValue, _ := strconv.ParseFloat(e.ChildText("#totalvalue"), 32)
		newImovel.Valor = parseValue
		parseTamanho, _ := strconv.Atoi(strings.Split(e.ChildText("div.lista-imoveis > article:nth-child(1) > div.imovel-data > ul > li:nth-child(3) > span > strong"), ",")[0])
		newImovel.Tamanho = parseTamanho
		parseQuartos, _ := strconv.Atoi(e.ChildText("div.lista-imoveis > article:nth-child(1) > div.imovel-data > ul > li:nth-child(1) > span > strong"))
		newImovel.Quartos = parseQuartos

		imoveis = append(imoveis, newImovel)

	})

	c.Visit(config.URL)

	// fmt.Println(imoveis)

	fodase, _ := json.MarshalIndent(imoveis, "", "  ")

	fmt.Println(string(fodase))

	//repository.Save(data)
}
