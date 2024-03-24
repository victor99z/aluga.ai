package repository

import (
	"database/sql"
	"log"

	"github.com/victor99z/aluga.ai/model"
)

func CreateTable() {
	// Open the database
	db, err := sql.Open("sqlite3", "../dataset.sqlite")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// Create the table
	sqlStmt := `
	CREATE TABLE apartamentos (
		id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
		site_name TEXT,
		price REAL,
		bedrooms INTEGER,
		bathrooms INTEGER,
		size REAL,
		description TEXT,
		city TEXT,
		neighborhood TEXT,
		url TEXT
	);
	`
	_, err = db.Exec(sqlStmt)
	if err != nil {
		log.Printf("%q: %s\n", err, sqlStmt)
		return
	}
}

// Create a function to save the data on sqlite
func Save(data model.Imovel) {
	// Open the database
	db, err := sql.Open("sqlite3", "../dataset.sqlite")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// Prepare the statement
	stmt, err := db.Prepare("INSERT INTO apartamentos values(site_name, valor, quartos, banheiros, tamanho, description, cidade, bairro, url) set (?, ?, ?, ?, ?, ?, ?, ?)")
	if err != nil {
		log.Fatal(err)
	}
	defer stmt.Close()

	// Execute the statement
	_, err = stmt.Exec(data.Website, data.ValorTotal, data.Quartos, data.Banheiros, data.TamanhoTotal, data.Desc, data.Cidade, data.Bairro, data.Url)
	if err != nil {
		log.Fatal(err)
	}
}
