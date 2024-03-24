package main

import (
	"encoding/json"
	"fmt"
	"regexp"

	"github.com/gocolly/colly/v2"
	"github.com/victor99z/aluga.ai/config"
	"github.com/victor99z/aluga.ai/model"
)

func main() {

	//repository.CreateTable()

	mainPage := colly.NewCollector()

	linksFromPage := make(map[string]bool)

	// imoveis := []model.Imovel{}

	// Find and visit all links
	// div.imovel-data > header > div > strong
	mainPage.OnHTML("article.imovel", func(e *colly.HTMLElement) {

		r, _ := regexp.Compile("/alugar/apartamento")

		href := e.ChildAttr("a[href]", "href")

		if r.MatchString(href) {
			linksFromPage[href] = true
		}
	})

	mainPage.Visit(config.URL)

	imoveisPage := colly.NewCollector()

	imoveis := []model.Imovel{}

	imoveisPage.OnHTML("div.visualizar-content", func(e *colly.HTMLElement) {
		newImovel := model.Imovel{}
		newImovel.Url = e.Request.URL.String()
		newImovel.Website = "imoveis-sc"
		newImovel.Desc = e.ChildText("section.visualizar-descricao-wrapper")

		imoveis = append(imoveis, newImovel)

	})

	for link := range linksFromPage {
		imoveisPage.Visit(link)
	}

	parseJson, _ := json.MarshalIndent(imoveis, "", "  ")

	fmt.Println(string(parseJson))

	//repository.Save(data)
}
