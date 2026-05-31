#include "TypeStripper.h"
#include "../core/Logger.h"
#include "../tree-sitter-typescript.h"
#include <algorithm>
#include <cstring>
#include <functional>
#include <string>
#include <tree_sitter/api.h>
#include <unordered_map>
#include <vector>

namespace Fovea {

struct Range {
  uint32_t start_byte;
  uint32_t end_byte;

  Range(uint32_t start, uint32_t end) : start_byte(start), end_byte(end) {}

  bool overlaps(const Range &other) const {
    return !(end_byte <= other.start_byte || start_byte >= other.end_byte);
  }

  bool operator<(const Range &other) const {
    return start_byte < other.start_byte;
  }
};

class TypeStripperVisitor {
private:
  const std::string &source;
  std::vector<Range> rangesToRemove;

  void addRange(uint32_t start, uint32_t end) {
    if (start < end && end <= source.length()) {
      rangesToRemove.emplace_back(start, end);
    }
  }

  void addNodeRange(TSNode node) {
    uint32_t start = ts_node_start_byte(node);
    uint32_t end = ts_node_end_byte(node);
    addRange(start, end);
  }

  void addNodeRangeWithColon(TSNode node) {
    uint32_t start = ts_node_start_byte(node);
    uint32_t end = ts_node_end_byte(node);
    if (start > 0 && source[start - 1] == ':') {
      addRange(start - 1, end);
    } else {
      addRange(start, end);
    }
  }

  void addNodeRangeWithSpace(TSNode node) {
    uint32_t start = ts_node_start_byte(node);
    uint32_t end = ts_node_end_byte(node);
    if (end < source.length() && source[end] == ' ') {
      addRange(start, end + 1);
    } else {
      addRange(start, end);
    }
  }

  bool isWhitespaceAt(uint32_t pos) const {
    return pos < source.length() && (source[pos] == ' ' || source[pos] == '\t');
  }

  void visitChildren(TSNode node) {
    uint32_t childCount = ts_node_child_count(node);
    for (uint32_t i = 0; i < childCount; i++) {
      TSNode child = ts_node_child(node, i);
      if (!ts_node_is_null(child)) {
        visitNode(child);
      }
    }
  }

  void visitNode(TSNode node) {
    if (ts_node_is_null(node)) {
      return;
    }

    const char *nodeType = ts_node_type(node);

    if (strcmp(nodeType, "type_annotation") == 0) {
      handleTypeAnnotation(node);
    } else if (strcmp(nodeType, "as_expression") == 0) {
      handleAsExpression(node);
    } else if (strcmp(nodeType, "satisfies_expression") == 0) {
      handleSatisfiesExpression(node);
    } else if (strcmp(nodeType, "interface_declaration") == 0) {
      handleInterfaceDeclaration(node);
    } else if (strcmp(nodeType, "type_alias_declaration") == 0) {
      handleTypeAliasDeclaration(node);
    } else if (strcmp(nodeType, "property_signature") == 0) {
      handlePropertySignature(node);
    } else if (strcmp(nodeType, "accessibility_modifier") == 0) {
      handleAccessibilityModifier(node);
    } else if (strcmp(nodeType, "readonly") == 0) {
      handleReadonly(node);
    } else if (strcmp(nodeType, "abstract") == 0) {
      handleAbstract(node);
    } else if (strcmp(nodeType, "override") == 0) {
      handleOverride(node);
    } else if (strcmp(nodeType, "declare") == 0) {
      handleDeclare(node);
    } else if (strcmp(nodeType, "implements_clause") == 0) {
      handleImplementsClause(node);
    } else if (strcmp(nodeType, "type_parameters") == 0) {
      handleTypeParameters(node);
    } else if (strcmp(nodeType, "type_parameter") == 0) {
      handleTypeParameter(node);
    } else if (strcmp(nodeType, "type_arguments") == 0) {
      handleTypeArguments(node);
    } else if (strcmp(nodeType, "predefined_type") == 0) {
      handlePredefinedType(node);
    } else if (strcmp(nodeType, "array_type") == 0) {
      handleArrayType(node);
    } else if (strcmp(nodeType, "tuple_type") == 0) {
      handleTupleType(node);
    } else if (strcmp(nodeType, "union_type") == 0) {
      handleUnionType(node);
    } else if (strcmp(nodeType, "intersection_type") == 0) {
      handleIntersectionType(node);
    } else if (strcmp(nodeType, "conditional_type") == 0) {
      handleConditionalType(node);
    } else if (strcmp(nodeType, "mapped_type") == 0) {
      handleMappedType(node);
    } else if (strcmp(nodeType, "type_literal") == 0 ||
               strcmp(nodeType, "object_type") == 0) {
      handleObjectType(node);
    } else if (strcmp(nodeType, "type_reference") == 0 ||
               strcmp(nodeType, "generic_type") == 0) {
      handleTypeReference(node);
    } else if (strcmp(nodeType, "type_query") == 0) {
      handleTypeQuery(node);
    } else if (strcmp(nodeType, "index_type_query") == 0 ||
               strcmp(nodeType, "lookup_type") == 0) {
      handleIndexedAccessType(node);
    } else if (strcmp(nodeType, "index_signature") == 0) {
      handleIndexSignature(node);
    } else if (strcmp(nodeType, "type_predicate") == 0) {
      handleTypePredicate(node);
    } else if (strcmp(nodeType, "parenthesized_type") == 0) {
      handleParenthesizedType(node);
    } else if (strcmp(nodeType, "this_type") == 0) {
      handleThisType(node);
    } else if (strcmp(nodeType, "template_literal_type") == 0) {
      handleTemplateLiteralType(node);
    } else if (strcmp(nodeType, "function_type") == 0 ||
               strcmp(nodeType, "constructor_type") == 0) {
      handleFunctionType(node);
    } else if (strcmp(nodeType, "optional_type") == 0) {
      handleOptionalType(node);
    } else if (strcmp(nodeType, "rest_type") == 0) {
      handleRestType(node);
    } else if (strcmp(nodeType, "literal_type") == 0) {
      handleLiteralType(node);
    } else if (strcmp(nodeType, "function_declaration") == 0) {
      handleFunctionDeclaration(node);
    } else if (strcmp(nodeType, "function_expression") == 0 ||
               strcmp(nodeType, "arrow_function") == 0) {
      handleFunctionExpression(node);
    } else if (strcmp(nodeType, "class_declaration") == 0 ||
               strcmp(nodeType, "abstract_class_declaration") == 0) {
      handleClassDeclaration(node);
    } else if (strcmp(nodeType, "class_expression") == 0) {
      handleClassExpression(node);
    } else if (strcmp(nodeType, "variable_declaration") == 0) {
      handleVariableDeclaration(node);
    } else if (strcmp(nodeType, "lexical_declaration") == 0) {
      handleLexicalDeclaration(node);
    } else if (strcmp(nodeType, "parameter") == 0) {
      handleParameter(node);
    } else if (strcmp(nodeType, "method_signature") == 0) {
      handleMethodSignature(node);
    } else if (strcmp(nodeType, "call_signature") == 0) {
      handleCallSignature(node);
    } else if (strcmp(nodeType, "construct_signature") == 0) {
      handleConstructSignature(node);
    } else if (strcmp(nodeType, "heritage_clause") == 0) {
      handleHeritageClause(node);
    } else if (strcmp(nodeType, "extends_clause") == 0) {
      handleExtendsClause(node);
    } else if (strcmp(nodeType, "call_expression") == 0) {
      handleCallExpression(node);
    } else if (strcmp(nodeType, "new_expression") == 0) {
      handleNewExpression(node);
    } else if (strcmp(nodeType, "property_declaration") == 0) {
      handlePropertyDeclaration(node);
    } else if (strcmp(nodeType, "method_declaration") == 0) {
      handleMethodDeclaration(node);
    } else if (strcmp(nodeType, "getter_signature") == 0 ||
               strcmp(nodeType, "setter_signature") == 0) {
      handleAccessorSignature(node);
    } else if (strcmp(nodeType, "getter") == 0 ||
               strcmp(nodeType, "setter") == 0) {
      handleAccessor(node);
    } else if (strcmp(nodeType, "import_statement") == 0 ||
               strcmp(nodeType, "import_declaration") == 0) {
      handleImportStatement(node);
    } else if (strcmp(nodeType, "export_statement") == 0 ||
               strcmp(nodeType, "export_declaration") == 0) {
      handleExportStatement(node);
    } else if (strcmp(nodeType, "namespace_declaration") == 0 ||
               strcmp(nodeType, "module") == 0) {
      handleNamespaceDeclaration(node);
    } else if (strcmp(nodeType, "enum_declaration") == 0) {
      handleEnumDeclaration(node);
    } else if (strcmp(nodeType, "decorator") == 0) {
      handleDecorator(node);
    } else if (strcmp(nodeType, "type_assertion") == 0) {
      handleTypeAssertion(node);
    } else if (strcmp(nodeType, "non_null_expression") == 0) {
      handleNonNullExpression(node);
    } else {
      visitChildren(node);
    }
  }

  void handleTypeAnnotation(TSNode node) { addNodeRangeWithColon(node); }

  void handleAsExpression(TSNode node) {
    uint32_t childCount = ts_node_child_count(node);
    if (childCount >= 3) {
      TSNode asKeyword = ts_node_child(node, 1);
      if (strcmp(ts_node_type(asKeyword), "as") == 0) {
        uint32_t asStart = ts_node_start_byte(asKeyword);
        uint32_t typeEnd = ts_node_end_byte(node);
        if (asStart > 0 && isWhitespaceAt(asStart - 1)) {
          asStart--;
        }
        addRange(asStart, typeEnd);
        visitNode(ts_node_child(node, 0));
        return;
      }
    }
    visitChildren(node);
  }

  void handleSatisfiesExpression(TSNode node) {
    uint32_t childCount = ts_node_child_count(node);
    if (childCount >= 3) {
      TSNode satisfiesKeyword = ts_node_child(node, 1);
      if (strcmp(ts_node_type(satisfiesKeyword), "satisfies") == 0) {
        uint32_t satisfiesStart = ts_node_start_byte(satisfiesKeyword);
        uint32_t typeEnd = ts_node_end_byte(node);
        if (satisfiesStart > 0 && isWhitespaceAt(satisfiesStart - 1)) {
          satisfiesStart--;
        }
        addRange(satisfiesStart, typeEnd);
        visitNode(ts_node_child(node, 0));
        return;
      }
    }
    visitChildren(node);
  }

  void handleInterfaceDeclaration(TSNode node) { addNodeRange(node); }

  void handleTypeAliasDeclaration(TSNode node) { addNodeRange(node); }

  void handlePropertySignature(TSNode node) {
    TSNode typeAnnotation = ts_node_child_by_field_name(node, "type", 4);
    if (!ts_node_is_null(typeAnnotation)) {
      addNodeRangeWithColon(typeAnnotation);
    }
    uint32_t childCount = ts_node_child_count(node);
    for (uint32_t i = 0; i < childCount; i++) {
      TSNode child = ts_node_child(node, i);
      const char *childType = ts_node_type(child);
      if (strcmp(childType, "?") == 0 || strcmp(childType, "optional") == 0) {
        addNodeRange(child);
      }
    }
    visitChildren(node);
  }

  void handleAccessibilityModifier(TSNode node) { addNodeRangeWithSpace(node); }

  void handleReadonly(TSNode node) { addNodeRangeWithSpace(node); }

  void handleAbstract(TSNode node) { addNodeRangeWithSpace(node); }

  void handleOverride(TSNode node) { addNodeRangeWithSpace(node); }

  void handleDeclare(TSNode node) { addNodeRangeWithSpace(node); }

  void handleImplementsClause(TSNode node) { addNodeRange(node); }

  void handleTypeParameters(TSNode node) { addNodeRange(node); }

  void handleTypeParameter(TSNode node) { addNodeRange(node); }

  void handleTypeArguments(TSNode node) { addNodeRange(node); }

  void handlePredefinedType(TSNode node) { addNodeRange(node); }

  void handleArrayType(TSNode node) { addNodeRange(node); }

  void handleTupleType(TSNode node) { addNodeRange(node); }

  void handleUnionType(TSNode node) { addNodeRange(node); }

  void handleIntersectionType(TSNode node) { addNodeRange(node); }

  void handleConditionalType(TSNode node) { addNodeRange(node); }

  void handleMappedType(TSNode node) { addNodeRange(node); }

  void handleObjectType(TSNode node) { addNodeRange(node); }

  void handleTypeReference(TSNode node) {
    TSNode typeArguments =
        ts_node_child_by_field_name(node, "type_arguments", 13);
    if (!ts_node_is_null(typeArguments)) {
      addNodeRange(typeArguments);
    }
    visitChildren(node);
  }

  void handleTypeQuery(TSNode node) { addNodeRange(node); }

  void handleIndexedAccessType(TSNode node) { addNodeRange(node); }

  void handleIndexSignature(TSNode node) { addNodeRange(node); }

  void handleTypePredicate(TSNode node) { addNodeRange(node); }

  void handleParenthesizedType(TSNode node) { addNodeRange(node); }

  void handleThisType(TSNode node) { addNodeRange(node); }

  void handleTemplateLiteralType(TSNode node) { addNodeRange(node); }

  void handleFunctionType(TSNode node) { addNodeRange(node); }

  void handleOptionalType(TSNode node) { addNodeRange(node); }

  void handleRestType(TSNode node) { addNodeRange(node); }

  void handleLiteralType(TSNode node) { addNodeRange(node); }

  void handleFunctionDeclaration(TSNode node) {
    TSNode typeParameters =
        ts_node_child_by_field_name(node, "type_parameters", 14);
    if (!ts_node_is_null(typeParameters)) {
      addNodeRange(typeParameters);
    }
    TSNode returnType = ts_node_child_by_field_name(node, "return_type", 10);
    if (!ts_node_is_null(returnType)) {
      addNodeRange(returnType);
    }
    visitChildren(node);
  }

  void handleFunctionExpression(TSNode node) {
    TSNode typeParameters =
        ts_node_child_by_field_name(node, "type_parameters", 14);
    if (!ts_node_is_null(typeParameters)) {
      addNodeRange(typeParameters);
    }
    TSNode returnType = ts_node_child_by_field_name(node, "return_type", 10);
    if (!ts_node_is_null(returnType)) {
      addNodeRange(returnType);
    }
    visitChildren(node);
  }

  void handleClassDeclaration(TSNode node) {
    TSNode typeParameters =
        ts_node_child_by_field_name(node, "type_parameters", 14);
    if (!ts_node_is_null(typeParameters)) {
      addNodeRange(typeParameters);
    }
    TSNode implementsClause =
        ts_node_child_by_field_name(node, "implements", 10);
    if (!ts_node_is_null(implementsClause)) {
      addNodeRange(implementsClause);
    }
    visitChildren(node);
  }

  void handleClassExpression(TSNode node) {
    TSNode typeParameters =
        ts_node_child_by_field_name(node, "type_parameters", 14);
    if (!ts_node_is_null(typeParameters)) {
      addNodeRange(typeParameters);
    }
    TSNode implementsClause =
        ts_node_child_by_field_name(node, "implements", 10);
    if (!ts_node_is_null(implementsClause)) {
      addNodeRange(implementsClause);
    }
    visitChildren(node);
  }

  void handleVariableDeclaration(TSNode node) {
    TSNode typeAnnotation = ts_node_child_by_field_name(node, "type", 4);
    if (!ts_node_is_null(typeAnnotation)) {
      addNodeRangeWithColon(typeAnnotation);
    }
    visitChildren(node);
  }

  void handleLexicalDeclaration(TSNode node) { visitChildren(node); }

  void handleParameter(TSNode node) {
    TSNode typeAnnotation = ts_node_child_by_field_name(node, "type", 4);
    if (!ts_node_is_null(typeAnnotation)) {
      addNodeRangeWithColon(typeAnnotation);
    }
    uint32_t childCount = ts_node_child_count(node);
    for (uint32_t i = 0; i < childCount; i++) {
      TSNode child = ts_node_child(node, i);
      const char *childType = ts_node_type(child);
      if (strcmp(childType, "?") == 0 || strcmp(childType, "optional") == 0) {
        addNodeRange(child);
      } else if (strcmp(childType, "accessibility_modifier") == 0) {
        addNodeRangeWithSpace(child);
      } else if (strcmp(childType, "readonly") == 0) {
        addNodeRangeWithSpace(child);
      }
    }
    visitChildren(node);
  }

  void handleMethodSignature(TSNode node) {
    TSNode typeParameters =
        ts_node_child_by_field_name(node, "type_parameters", 14);
    if (!ts_node_is_null(typeParameters)) {
      addNodeRange(typeParameters);
    }
    TSNode returnType = ts_node_child_by_field_name(node, "return_type", 10);
    if (!ts_node_is_null(returnType)) {
      addNodeRange(returnType);
    }
    uint32_t childCount = ts_node_child_count(node);
    for (uint32_t i = 0; i < childCount; i++) {
      TSNode child = ts_node_child(node, i);
      const char *childType = ts_node_type(child);
      if (strcmp(childType, "?") == 0 || strcmp(childType, "optional") == 0) {
        addNodeRange(child);
      }
    }
    visitChildren(node);
  }

  void handleCallSignature(TSNode node) {
    TSNode typeParameters =
        ts_node_child_by_field_name(node, "type_parameters", 14);
    if (!ts_node_is_null(typeParameters)) {
      addNodeRange(typeParameters);
    }
    TSNode returnType = ts_node_child_by_field_name(node, "return_type", 10);
    if (!ts_node_is_null(returnType)) {
      addNodeRange(returnType);
    }
    visitChildren(node);
  }

  void handleConstructSignature(TSNode node) {
    TSNode typeParameters =
        ts_node_child_by_field_name(node, "type_parameters", 14);
    if (!ts_node_is_null(typeParameters)) {
      addNodeRange(typeParameters);
    }
    TSNode returnType = ts_node_child_by_field_name(node, "return_type", 10);
    if (!ts_node_is_null(returnType)) {
      addNodeRange(returnType);
    }
    visitChildren(node);
  }

  void handleHeritageClause(TSNode node) {
    uint32_t childCount = ts_node_child_count(node);
    if (childCount > 0) {
      TSNode firstChild = ts_node_child(node, 0);
      const char *firstType = ts_node_type(firstChild);
      if (strcmp(firstType, "implements") == 0) {
        addNodeRange(node);
      } else if (strcmp(firstType, "extends") == 0) {
        TSNode typeArguments =
            ts_node_child_by_field_name(node, "type_arguments", 13);
        if (!ts_node_is_null(typeArguments)) {
          addNodeRange(typeArguments);
        }
        visitChildren(node);
      } else {
        visitChildren(node);
      }
    } else {
      visitChildren(node);
    }
  }

  void handleExtendsClause(TSNode node) {
    TSNode typeArguments =
        ts_node_child_by_field_name(node, "type_arguments", 13);
    if (!ts_node_is_null(typeArguments)) {
      addNodeRange(typeArguments);
    }
    visitChildren(node);
  }

  void handleCallExpression(TSNode node) {
    TSNode typeArguments =
        ts_node_child_by_field_name(node, "type_arguments", 13);
    if (!ts_node_is_null(typeArguments)) {
      addNodeRange(typeArguments);
    }
    visitChildren(node);
  }

  void handleNewExpression(TSNode node) {
    TSNode typeArguments =
        ts_node_child_by_field_name(node, "type_arguments", 13);
    if (!ts_node_is_null(typeArguments)) {
      addNodeRange(typeArguments);
    }
    visitChildren(node);
  }

  void handlePropertyDeclaration(TSNode node) {
    TSNode typeAnnotation = ts_node_child_by_field_name(node, "type", 4);
    if (!ts_node_is_null(typeAnnotation)) {
      addNodeRangeWithColon(typeAnnotation);
    }
    uint32_t childCount = ts_node_child_count(node);
    for (uint32_t i = 0; i < childCount; i++) {
      TSNode child = ts_node_child(node, i);
      const char *childType = ts_node_type(child);
      if (strcmp(childType, "?") == 0 || strcmp(childType, "optional") == 0) {
        addNodeRange(child);
      } else if (strcmp(childType, "!") == 0 ||
                 strcmp(childType, "definite_assignment") == 0) {
        addNodeRange(child);
      }
    }
    visitChildren(node);
  }

  void handleMethodDeclaration(TSNode node) {
    TSNode typeParameters =
        ts_node_child_by_field_name(node, "type_parameters", 14);
    if (!ts_node_is_null(typeParameters)) {
      addNodeRange(typeParameters);
    }
    TSNode returnType = ts_node_child_by_field_name(node, "return_type", 10);
    if (!ts_node_is_null(returnType)) {
      addNodeRange(returnType);
    }
    uint32_t childCount = ts_node_child_count(node);
    for (uint32_t i = 0; i < childCount; i++) {
      TSNode child = ts_node_child(node, i);
      const char *childType = ts_node_type(child);
      if (strcmp(childType, "?") == 0 || strcmp(childType, "optional") == 0) {
        addNodeRange(child);
      }
    }
    visitChildren(node);
  }

  void handleAccessorSignature(TSNode node) {
    TSNode returnType = ts_node_child_by_field_name(node, "return_type", 10);
    if (!ts_node_is_null(returnType)) {
      addNodeRange(returnType);
    }
    visitChildren(node);
  }

  void handleAccessor(TSNode node) {
    TSNode returnType = ts_node_child_by_field_name(node, "return_type", 10);
    if (!ts_node_is_null(returnType)) {
      addNodeRange(returnType);
    }
    visitChildren(node);
  }

  void handleImportStatement(TSNode node) {
    uint32_t childCount = ts_node_child_count(node);
    for (uint32_t i = 0; i < childCount; i++) {
      TSNode child = ts_node_child(node, i);
      const char *childType = ts_node_type(child);
      if (strcmp(childType, "type") == 0 || strcmp(childType, "import") == 0) {
        TSNode importClause = child;
        uint32_t clauseChildCount = ts_node_child_count(importClause);
        for (uint32_t j = 0; j < clauseChildCount; j++) {
          TSNode clauseChild = ts_node_child(importClause, j);
          if (strcmp(ts_node_type(clauseChild), "type") == 0) {
            addNodeRangeWithSpace(clauseChild);
          }
        }
      }
    }
    visitChildren(node);
  }

  void handleExportStatement(TSNode node) {
    uint32_t childCount = ts_node_child_count(node);
    
    // Check if this export statement contains an interface or type alias
    // In that case, strip the entire export statement (including the 'export' keyword)
    for (uint32_t i = 0; i < childCount; i++) {
      TSNode child = ts_node_child(node, i);
      const char *childType = ts_node_type(child);
      if (strcmp(childType, "interface_declaration") == 0 ||
          strcmp(childType, "type_alias_declaration") == 0) {
        // Strip the entire export statement
        addNodeRange(node);
        return;
      }
    }
    
    // Otherwise, handle type-only exports (export type { ... })
    for (uint32_t i = 0; i < childCount; i++) {
      TSNode child = ts_node_child(node, i);
      const char *childType = ts_node_type(child);
      if (strcmp(childType, "type") == 0 || strcmp(childType, "export") == 0) {
        TSNode exportClause = child;
        uint32_t clauseChildCount = ts_node_child_count(exportClause);
        for (uint32_t j = 0; j < clauseChildCount; j++) {
          TSNode clauseChild = ts_node_child(exportClause, j);
          if (strcmp(ts_node_type(clauseChild), "type") == 0) {
            addNodeRangeWithSpace(clauseChild);
          }
        }
      }
    }
    visitChildren(node);
  }

  void handleNamespaceDeclaration(TSNode node) { visitChildren(node); }

  void handleEnumDeclaration(TSNode node) { visitChildren(node); }

  void handleDecorator(TSNode node) { visitChildren(node); }

  void handleTypeAssertion(TSNode node) {
    TSNode type = ts_node_child_by_field_name(node, "type", 4);
    if (!ts_node_is_null(type)) {
      uint32_t typeStart = ts_node_start_byte(type);
      uint32_t nodeStart = ts_node_start_byte(node);
      uint32_t typeEnd = ts_node_end_byte(type);
      uint32_t nodeEnd = ts_node_end_byte(node);
      if (typeStart > nodeStart) {
        addRange(nodeStart, typeStart);
      }
      if (typeEnd < nodeEnd) {
        addRange(typeEnd, nodeEnd);
      }
      visitNode(type);
    } else {
      visitChildren(node);
    }
  }

  void handleNonNullExpression(TSNode node) {
    TSNode expression = ts_node_child_by_field_name(node, "expression", 10);
    if (!ts_node_is_null(expression)) {
      TSNode exclamationToken =
          ts_node_child_by_field_name(node, "exclamation", 11);
      if (!ts_node_is_null(exclamationToken)) {
        addNodeRange(exclamationToken);
      }
      visitNode(expression);
    } else {
      visitChildren(node);
    }
  }

public:
  TypeStripperVisitor(const std::string &src) : source(src) {}

  void visit(TSNode root) { visitNode(root); }

  std::vector<Range> getRanges() const { return rangesToRemove; }
};

std::string TypeStripper::Strip(const std::string &source) {
  if (source.empty()) {
    return source;
  }

  TSParser *parser = ts_parser_new();
  if (!parser) {
    auto &logger = Logger::GetInstance();
    logger.Error("TypeStripper", "Failed to create tree-sitter parser");
    return source;
  }

  const TSLanguage *language = tree_sitter_typescript();
  if (!ts_parser_set_language(parser, language)) {
    auto &logger = Logger::GetInstance();
    logger.Error("TypeStripper", "Failed to set tree-sitter language");
    ts_parser_delete(parser);
    return source;
  }

  TSTree *tree =
      ts_parser_parse_string(parser, nullptr, source.c_str(), source.length());
  if (!tree) {
    auto &logger = Logger::GetInstance();
    logger.Error("TypeStripper", "Failed to parse TypeScript source");
    ts_parser_delete(parser);
    return source;
  }

  TSNode root = ts_tree_root_node(tree);

  TypeStripperVisitor visitor(source);
  visitor.visit(root);

  std::vector<Range> rangesToRemove = visitor.getRanges();

  // Sort ranges ascending for forward iteration (though order doesn't strictly
  // matter for replacement)
  std::sort(rangesToRemove.begin(), rangesToRemove.end(),
            [](const Range &a, const Range &b) {
              return a.start_byte < b.start_byte;
            });

  std::string result = source;
  for (const auto &range : rangesToRemove) {
    if (range.start_byte < result.length() &&
        range.end_byte <= result.length()) {
      // Instead of erasing, replace with specific whitespace to preserve
      // line/column counts
      for (uint32_t i = range.start_byte; i < range.end_byte; ++i) {
        // Preserve newlines so line numbers stay in sync
        if (result[i] != '\n' && result[i] != '\r') {
          result[i] = ' ';
        }
      }
    }
  }

  ts_tree_delete(tree);
  ts_parser_delete(parser);

  return result;
}

} // namespace Fovea