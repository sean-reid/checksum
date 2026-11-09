use serde::Deserialize;

#[derive(Deserialize)]
pub struct Category {
    pub name: String,
    pub article: String,
    pub members: Vec<String>,
}

pub fn load() -> Vec<Category> {
    serde_json::from_str(include_str!("../data/categories.json")).expect("categories.json")
}
