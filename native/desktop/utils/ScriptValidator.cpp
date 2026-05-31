#include "ScriptValidator.h"
#include "../core/Logger.h"
#include <tree_sitter/api.h>
#include "../tree-sitter-typescript.h"
#include <cstring>
#include <algorithm>
#include <functional>

namespace Fovea {

bool ScriptValidator::Validate(const std::string& source, const std::string& filePath, std::vector<ScriptError>& errors) {
    errors.clear();
    
    TSParser* parser = ts_parser_new();
    if (!parser) {
        errors.push_back({"Failed to create parser", 0, 0, 0, 0});
        return false;
    }
    
    const TSLanguage* language = nullptr;
    size_t dotPos = filePath.find_last_of('.');
    std::string ext = (dotPos != std::string::npos) ? filePath.substr(dotPos) : "";
    std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
    
    if (ext == ".ts" || ext == ".tsx" || ext == ".js" || ext == ".mjs") {
        language = tree_sitter_typescript();
    } else {
        ts_parser_delete(parser);
        errors.push_back({"Unsupported file type: " + ext, 0, 0, 0, 0});
        return false;
    }
    
    if (!language) {
        ts_parser_delete(parser);
        errors.push_back({"Failed to load language parser", 0, 0, 0, 0});
        return false;
    }
    
    ts_parser_set_language(parser, language);
    
    TSTree* tree = ts_parser_parse_string(parser, nullptr, source.c_str(), source.length());
    if (!tree) {
        ts_parser_delete(parser);
        errors.push_back({"Failed to parse source", 0, 0, 0, 0});
        return false;
    }
    
    TSNode root = ts_tree_root_node(tree);
    
    bool hasErrors = false;
    
    if (ts_node_has_error(root)) {
        hasErrors = true;
        
        std::function<void(TSNode)> collectErrors = [&](TSNode node) {
            if (ts_node_is_null(node)) {
                return;
            }
            
            const char* nodeType = ts_node_type(node);
            if (strcmp(nodeType, "ERROR") == 0 || ts_node_is_missing(node)) {
                ScriptError error;
                TSPoint start = ts_node_start_point(node);
                TSPoint end = ts_node_end_point(node);
                error.line = start.row + 1;
                error.column = start.column + 1;
                error.startByte = ts_node_start_byte(node);
                error.endByte = ts_node_end_byte(node);
                
                if (ts_node_is_missing(node)) {
                    error.message = "Missing " + std::string(nodeType);
                } else {
                    uint32_t startByte = ts_node_start_byte(node);
                    uint32_t endByte = ts_node_end_byte(node);
                    if (startByte < source.length()) {
                        uint32_t len = std::min(endByte - startByte, (uint32_t)50u);
                        error.message = "Syntax error near: " + source.substr(startByte, len);
                    } else {
                        error.message = "Syntax error";
                    }
                }
                
                errors.push_back(error);
            }
            
            uint32_t childCount = ts_node_child_count(node);
            for (uint32_t i = 0; i < childCount; i++) {
                TSNode child = ts_node_child(node, i);
                if (!ts_node_is_null(child)) {
                    collectErrors(child);
                }
            }
        };
        
        collectErrors(root);
    }
    
    ts_tree_delete(tree);
    ts_parser_delete(parser);
    
    return !hasErrors;
}

bool ScriptValidator::IsValid(const std::string& source, const std::string& filePath) {
    std::vector<ScriptError> errors;
    return Validate(source, filePath, errors);
}

}

